package fit.pep.position

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private val PERMISSIONS = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

// Précision demandée, valeurs d'expo-location (Accuracy) : Balanced (3) et en dessous passent aussi par le réseau.
private const val PRECISION_HAUTE = 4

private const val ATTENTE_MESURE_MS = 30_000L

// Position du téléphone par LocationManager, à la place d'expo-location sur Android (édition libre : expo-location tire
// play-services-location). Mêmes formes que le sous-ensemble d'expo-location qu'utilise l'appli (src/natif/position) : autorisation
// « au premier plan », dernière position connue, une mesure, un suivi continu. Le suivi des séances garde son service (pepfit-suivi).
class PepfitPositionModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val gestionnaire: LocationManager
    get() = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

  private val permissions: Permissions
    get() = appContext.permissions ?: throw Exceptions.PermissionsModuleNotFound()

  private val main = Handler(Looper.getMainLooper())
  private val suivis = mutableMapOf<Int, LocationListener>()

  override fun definition() = ModuleDefinition {
    Name("PepfitPosition")
    Events("position")

    AsyncFunction("autorisation") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(permissions, promise, *PERMISSIONS)
    }

    AsyncFunction("demanderAutorisation") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(permissions, promise, *PERMISSIONS)
    }

    /** La plus récente des positions gardées par les fournisseurs, si elle a moins de `ageMaxMs` ; null sinon. */
    Function("derniere") { ageMaxMs: Double? ->
      if (!autorise()) return@Function null
      val l = fournisseurs(PRECISION_HAUTE - 1).plus(LocationManager.PASSIVE_PROVIDER)
        .mapNotNull { derniereDe(it) }
        .maxByOrNull { it.time } ?: return@Function null
      val ageMs = (SystemClock.elapsedRealtimeNanos() - l.elapsedRealtimeNanos) / 1_000_000
      if (ageMaxMs != null && ageMs > ageMaxMs) null else versJs(l)
    }

    /** Une mesure : le premier fix d'un des fournisseurs actifs (30 s au plus). */
    AsyncFunction("mesurer") { precision: Int, promise: Promise ->
      if (!autorise()) return@AsyncFunction promise.reject(CodedException("ERR_POSITION_REFUS", "position non autorisée", null))
      val noms = fournisseurs(precision)
      if (noms.isEmpty()) return@AsyncFunction promise.reject(CodedException("ERR_POSITION_ETEINTE", "localisation désactivée", null))
      var fini = false
      lateinit var ecouteur: LocationListener
      val delai = Runnable {
        if (fini) return@Runnable
        fini = true
        gestionnaire.removeUpdates(ecouteur)
        promise.reject(CodedException("ERR_POSITION_INTROUVABLE", "aucune position en ${ATTENTE_MESURE_MS / 1000} s", null))
      }
      ecouteur = nouvelEcouteur { l ->
        if (fini) return@nouvelEcouteur
        fini = true
        main.removeCallbacks(delai)
        gestionnaire.removeUpdates(ecouteur)
        promise.resolve(versJs(l))
      }
      main.post {
        try {
          noms.forEach { demander(it, 0L, 0f, ecouteur) }
          main.postDelayed(delai, ATTENTE_MESURE_MS)
        } catch (e: Exception) {
          fini = true
          promise.reject(CodedException("ERR_POSITION", e.message, e))
        }
      }
    }

    /** Suivi continu : chaque fix part en évènement « position » avec son numéro ; arrete(id) le coupe. */
    Function("suivre") { id: Int, precision: Int, intervalleMs: Double, distanceM: Double ->
      if (!autorise()) throw CodedException("ERR_POSITION_REFUS", "position non autorisée", null)
      val ecouteur = nouvelEcouteur { l -> sendEvent("position", versJs(l).plus("id" to id)) }
      suivis[id] = ecouteur
      main.post { fournisseurs(precision).forEach { demander(it, intervalleMs.toLong(), distanceM.toFloat(), ecouteur) } }
    }

    Function("arreter") { id: Int ->
      suivis.remove(id)?.let { e -> main.post { gestionnaire.removeUpdates(e) } }
    }

    OnDestroy {
      suivis.values.forEach { gestionnaire.removeUpdates(it) }
      suivis.clear()
    }
  }

  private fun autorise() = PERMISSIONS.any { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

  /** GPS seul en haute précision ; sinon le réseau aussi (plus rapide en intérieur). Seulement les fournisseurs allumés. */
  private fun fournisseurs(precision: Int): List<String> {
    val gm = gestionnaire
    val fin = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val noms = buildList {
      if (fin) add(LocationManager.GPS_PROVIDER)
      if (precision < PRECISION_HAUTE || !fin) add(LocationManager.NETWORK_PROVIDER)
    }
    return noms.filter { gm.allProviders.contains(it) && gm.isProviderEnabled(it) }
  }

  @SuppressLint("MissingPermission")
  private fun derniereDe(fournisseur: String): Location? =
    try { gestionnaire.getLastKnownLocation(fournisseur) } catch (_: Exception) { null }

  @SuppressLint("MissingPermission")
  private fun demander(fournisseur: String, intervalleMs: Long, distanceM: Float, ecouteur: LocationListener) =
    gestionnaire.requestLocationUpdates(fournisseur, intervalleMs, distanceM, ecouteur, Looper.getMainLooper())

  private fun nouvelEcouteur(f: (Location) -> Unit) = object : LocationListener {
    override fun onLocationChanged(location: Location) = f(location)
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}
    @Deprecated("API < 29")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
  }

  /** Forme d'expo-location : { coords: { latitude, longitude, accuracy, altitude, speed, heading }, timestamp }. */
  private fun versJs(l: Location): Map<String, Any?> = mapOf(
    "timestamp" to l.time.toDouble(),
    "coords" to mapOf(
      "latitude" to l.latitude,
      "longitude" to l.longitude,
      "accuracy" to if (l.hasAccuracy()) l.accuracy.toDouble() else null,
      "altitude" to if (l.hasAltitude()) l.altitude else null,
      "altitudeAccuracy" to if (Build.VERSION.SDK_INT >= 26 && l.hasVerticalAccuracy()) l.verticalAccuracyMeters.toDouble() else null,
      "speed" to if (l.hasSpeed()) l.speed.toDouble() else null,
      "heading" to if (l.hasBearing()) l.bearing.toDouble() else null,
    ),
  )
}
