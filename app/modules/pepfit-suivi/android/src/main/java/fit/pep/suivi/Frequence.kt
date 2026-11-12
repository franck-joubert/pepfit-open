package fit.pep.suivi

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import java.util.UUID

val SERVICE_FC: UUID = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
val MESURE_FC: UUID = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")
private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

/** Lecture de 0x2A37 : drapeaux, FC sur 8 ou 16 bits, contact (bits 1-2). Même règle que logique.ts. */
fun lireFrequence(v: ByteArray): Pair<Int, Boolean?>? {
  if (v.size < 2) return null
  val f = v[0].toInt() and 0xff
  val bpm = if (f and 0x01 != 0) {
    if (v.size < 3) return null
    (v[1].toInt() and 0xff) or ((v[2].toInt() and 0xff) shl 8)
  } else {
    v[1].toInt() and 0xff
  }
  val contact = if (f and 0x04 != 0) (f and 0x02 != 0) else null
  return bpm to contact
}

/**
 * Capteur de FC Bluetooth standard (Whoop en « Broadcast Heart Rate ») : recherche du service 0x180D si aucune adresse,
 * connexion GATT, abonnement à 0x2A37, reconnexion à la perte. Les autorisations sont vérifiées par l'appelant.
 *
 * Padel du 30/10 (écran éteint, FC coupée 15 min puis sur la fin) : la reconnexion partait d'un `postDelayed` de 3 s, or
 * l'horloge des Handler s'arrête quand le processeur dort ; elle ne repartait qu'au rallumage de l'écran. Désormais :
 * 1. la perte relance la connexion tout de suite, dans le rappel du système ;
 * 2. les délais (silence, tentative trop longue, recherche) sont comptés en `elapsedRealtime` et vérifiés chaque seconde par
 *    le service (`verifier`), qui tient un wake lock partiel pendant la séance ;
 * 3. un lien ouvert mais muet plus de SILENCE_MS est refait ; une connexion qui n'aboutit pas en TENTATIVE_MS laisse place
 *    à une recherche (la Whoop peut changer d'adresse), limitée au même capteur (son adresse ou son nom) ;
 * 4. chaque étape va au journal local (Suivi.journal), sans adresse, nom ni FC.
 */
@SuppressLint("MissingPermission")
class Frequence(private val ctx: Context, private val surChangement: () -> Unit) {
  private val main = Handler(Looper.getMainLooper())
  private val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?
  private var gatt: BluetoothGatt? = null
  private var scan: ScanCallback? = null
  private var actif = false
  private var adresse: String? = null

  // Horloges en elapsedRealtime (elle avance aussi quand le processeur dort, contrairement à celle des Handler).
  /** Connexion GATT lancée (ou lien établi, en attente de la première mesure) depuis ; 0 : aucune. */
  private var tentativeDepuis = 0L
  /** Fin de la recherche en cours. */
  private var rechercheJusqua = 0L
  /** Pas de nouvel essai avant (Bluetooth coupé, capteur sans service FC, recherche impossible). */
  private var prochainEssai = 0L
  /** Mesures reçues sur le lien en cours. */
  private var abonne = false
  private var derniereMesure = 0L
  /** FC perdue depuis ; 0 : jamais perdue, ou reprise. */
  private var perteDepuis = 0L
  private var sansBluetooth = false

  fun demarrer(adr: String?) {
    actif = true
    adresse = adr
    lancer()
  }

  fun arreter() {
    actif = false
    main.removeCallbacksAndMessages(null)
    arreterRecherche()
    fermerLien()
  }

  private fun maintenant() = SystemClock.elapsedRealtime()

  /** Connexion au capteur connu (directe : rapide s'il est là), sinon recherche. */
  private fun lancer() {
    val a = manager?.adapter
    if (a == null || !a.isEnabled) {
      if (!sansBluetooth) Suivi.journal("bluetooth_coupe")
      sansBluetooth = true
      Suivi.fcEtat = "sans_bluetooth"
      prochainEssai = maintenant() + PAUSE_MS
      surChangement()
      return
    }
    if (sansBluetooth) Suivi.journal("bluetooth_revenu")
    sansBluetooth = false
    val adr = adresse
    if (adr != null) connecter(a.getRemoteDevice(adr), false) else chercher()
  }

  /** Appelé chaque seconde par le service (sous wake lock) : silence, tentative trop longue, fin de recherche, nouvel essai. */
  fun verifier() {
    if (!actif) return
    val t = maintenant()
    if (abonne && t - derniereMesure > SILENCE_MS) {
      Suivi.journal("silence", (t - derniereMesure) / 1000)
      fermerLien()
      perdre()
      lancer()
      return
    }
    val cb = scan
    if (cb != null) {
      if (t < rechercheJusqua) return
      // rien trouvé : on attend le capteur connu à sa dernière adresse (autoConnect, sans recherche active)
      arreterRecherche()
      Suivi.journal("recherche_vaine")
      val adr = adresse
      val a = manager?.adapter
      if (adr != null && a != null && a.isEnabled) connecter(a.getRemoteDevice(adr), true) else prochainEssai = t + PAUSE_MS
      return
    }
    // connexion qui n'aboutit pas (hors de portée, ou adresse changée) : on le cherche
    if (gatt != null && !abonne && tentativeDepuis > 0 && t - tentativeDepuis > TENTATIVE_MS) {
      Suivi.journal("tentative_longue", (t - tentativeDepuis) / 1000)
      fermerLien()
      chercher()
      return
    }
    if (gatt == null && t >= prochainEssai) lancer()
  }

  private fun perdre() {
    if (perteDepuis == 0L) perteDepuis = maintenant()
    abonne = false
    Suivi.fcEtat = "perdu"
    surChangement()
  }

  private fun fermerLien() {
    val g = gatt ?: return
    gatt = null
    abonne = false
    tentativeDepuis = 0
    try { g.disconnect() } catch (_: Exception) {}
    try { g.close() } catch (_: Exception) {}
  }

  /** Le capteur cherché : n'importe lequel au premier suivi ; ensuite le même (adresse, ou nom si l'adresse a changé). */
  private fun estLeCapteur(r: ScanResult): Boolean {
    if (adresse == null) return true
    if (r.device.address == adresse) return true
    val connu = Suivi.appareil ?: return false
    val nom = r.scanRecord?.deviceName ?: try { r.device.name } catch (_: Exception) { null }
    return nom != null && nom == connu
  }

  private fun chercher() {
    val scanner = manager?.adapter?.takeIf { it.isEnabled }?.bluetoothLeScanner
    if (scanner == null) {
      prochainEssai = maintenant() + PAUSE_MS
      return
    }
    Suivi.fcEtat = if (perteDepuis > 0) "perdu" else "recherche"
    surChangement()
    Suivi.journal("recherche")
    val cb = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        main.post {
          if (!actif || scan !== this || !estLeCapteur(result)) return@post
          arreterRecherche()
          Suivi.journal("trouve", if (result.device.address == adresse) "meme_adresse" else "autre_adresse")
          connecter(result.device, false)
        }
      }

      override fun onScanFailed(errorCode: Int) {
        main.post { if (scan === this) Suivi.journal("recherche_echec", errorCode) }
      }
    }
    scan = cb
    rechercheJusqua = maintenant() + RECHERCHE_MS
    // filtrée sur 0x180D : Android la laisse tourner écran éteint
    val filtre = ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_FC)).build()
    val reglages = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
    try {
      scanner.startScan(listOf(filtre), reglages, cb)
    } catch (_: Exception) {
      scan = null
      prochainEssai = maintenant() + PAUSE_MS
    }
  }

  private fun arreterRecherche() {
    val cb = scan ?: return
    scan = null
    try { manager?.adapter?.bluetoothLeScanner?.stopScan(cb) } catch (_: Exception) {}
  }

  private fun connecter(appareil: BluetoothDevice, auto: Boolean) {
    fermerLien()
    Suivi.fcEtat = if (perteDepuis > 0) "perdu" else "connexion"
    adresse = appareil.address
    Suivi.adresse = appareil.address
    Suivi.appareil = (try { appareil.name } catch (_: Exception) { null }) ?: Suivi.appareil
    surChangement()
    Suivi.journal(if (auto) "attente" else "connexion")
    tentativeDepuis = maintenant()
    gatt = try { appareil.connectGatt(ctx, auto, rappels, BluetoothDevice.TRANSPORT_LE) } catch (_: Exception) { null }
    if (gatt == null) {
      tentativeDepuis = 0
      prochainEssai = maintenant() + PAUSE_MS
    }
  }

  private val rappels = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
      main.post {
        // rappel d'un lien déjà remplacé : on le ferme, il ne compte plus
        if (!actif || g !== gatt) {
          if (g !== gatt) try { g.close() } catch (_: Exception) {}
          return@post
        }
        if (newState == BluetoothProfile.STATE_CONNECTED) {
          Suivi.journal("lien", status)
          tentativeDepuis = maintenant()
          g.discoverServices()
        } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
          // status : 8 = délai dépassé (capteur hors de portée), 19 = coupé par le capteur, 133 = erreur de la pile
          Suivi.journal("deconnexion", status)
          val mesurait = abonne
          fermerLien()
          perdre()
          // tout de suite, jamais par un postDelayed (il ne partirait qu'au réveil du téléphone) : le même capteur s'il
          // mesurait, sinon (tentative ratée) une recherche, qui le retrouve même sous une autre adresse
          if (mesurait) lancer() else chercher()
        }
      }
    }

    override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
      main.post {
        if (!actif || g !== gatt) return@post
        val c = g.getService(SERVICE_FC)?.getCharacteristic(MESURE_FC)
        if (c == null) {
          // pas de service FC : diffusion coupée côté Whoop ; nouvel essai dans PAUSE_MS
          Suivi.journal("sans_service")
          fermerLien()
          perdre()
          prochainEssai = maintenant() + PAUSE_MS
          return@post
        }
        g.setCharacteristicNotification(c, true)
        val d = c.getDescriptor(CCCD) ?: return@post
        if (Build.VERSION.SDK_INT >= 33) {
          g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
        } else {
          @Suppress("DEPRECATION")
          d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
          @Suppress("DEPRECATION")
          g.writeDescriptor(d)
        }
      }
    }

    override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {
      recu(g, c, value)
    }

    @Deprecated("Android 12 et moins")
    override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
      @Suppress("DEPRECATION")
      if (Build.VERSION.SDK_INT < 33) recu(g, c, c.value ?: return)
    }
  }

  private fun recu(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {
    if (c.uuid != MESURE_FC) return
    val (bpm, contact) = lireFrequence(value) ?: return
    main.post {
      if (!actif || g !== gatt) return@post
      val t = maintenant()
      derniereMesure = t
      if (!abonne) {
        abonne = true
        tentativeDepuis = 0
        if (perteDepuis > 0) Suivi.journal("reprise", (t - perteDepuis) / 1000) else Suivi.journal("mesures")
        perteDepuis = 0
      }
      Suivi.frequence(bpm, contact)
    }
  }

  companion object {
    /** Lien ouvert sans mesure au-delà de ce délai : refait (la Whoop diffuse environ une mesure par seconde). */
    const val SILENCE_MS = 15_000L
    /** Connexion (ou abonnement) qui n'aboutit pas : place à une recherche. */
    const val TENTATIVE_MS = 30_000L
    const val RECHERCHE_MS = 15_000L
    const val PAUSE_MS = 10_000L

    /** Recherche ponctuelle (écran de départ, labo) : appareils qui annoncent 0x180D ou dont le nom contient « whoop ». */
    @SuppressLint("MissingPermission")
    fun lister(ctx: Context, dureeMs: Long, fini: (List<Map<String, Any?>>) -> Unit) {
      val scanner = (ctx.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter?.takeIf { it.isEnabled }?.bluetoothLeScanner
      if (scanner == null) {
        fini(emptyList())
        return
      }
      val vus = linkedMapOf<String, Map<String, Any?>>()
      val cb = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, r: ScanResult) {
          val fc = r.scanRecord?.serviceUuids?.any { it.uuid == SERVICE_FC } == true
          val nom = r.scanRecord?.deviceName ?: try { r.device.name } catch (_: Exception) { null }
          if (!fc && nom?.contains("whoop", ignoreCase = true) != true) return
          synchronized(vus) { vus[r.device.address] = mapOf("adresse" to r.device.address, "nom" to nom, "rssi" to r.rssi, "fc" to fc) }
        }
      }
      val reglages = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
      try { scanner.startScan(null, reglages, cb) } catch (e: Exception) {
        fini(emptyList())
        return
      }
      Handler(Looper.getMainLooper()).postDelayed({
        try { scanner.stopScan(cb) } catch (_: Exception) {}
        fini(synchronized(vus) { vus.values.toList() })
      }, dureeMs)
    }
  }
}
