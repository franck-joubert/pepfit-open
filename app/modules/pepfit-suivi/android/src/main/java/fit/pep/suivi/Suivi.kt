package fit.pep.suivi

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileWriter
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** Borne de tour : temps de séance hors pauses (ms) et distance cumulée (m) au toucher. */
data class Tour(val n: Int, val s: Long, val d: Double)

/**
 * État du suivi, partagé par le service et le module (même processus). Le tampon sur disque
 * (filesDir/suivi/<id>/ : etat.json, points.csv, fc.csv) survit à la mort du JS et du processus :
 * il reste jusqu'à `effacer(id)`, une fois la séance enregistrée par l'appli.
 */
object Suivi {
  const val PRECISION_MAX_M = 30.0
  const val VITESSE_MAX_MS = 15.0
  const val SAUTS_REANCRAGE = 3
  private const val GPS_PERDU_MS = 10_000L

  var statut = "arrete"
  var id: String? = null
  var mode: String? = null
  var titre = "Suivi"
  var debut = 0L
  var pauseDebut: Long? = null
  var pauseCumulMs = 0L
  var distanceM = 0.0
  val tours = mutableListOf<Tour>()

  var gpsEtat = "coupe"
  var lat: Double? = null
  var lon: Double? = null
  var precision: Double? = null
  var altGps: Double? = null
  var vitesse: Double? = null
  var fixT: Long? = null
  private var origine: DoubleArray? = null // dernier point sûr (lat, lon, s)
  private var sauts = 0 // sauts d'affilée : au 3e, la position devient l'origine sans compter (premier fix périmé)

  var fcEtat = "coupe"
  var bpm: Int? = null
  var contact: Boolean? = null
  var fcT: Long? = null
  var appareil: String? = null
  var adresse: String? = null

  var baroPresent = false
  var pression: Double? = null
  var altBaro: Double? = null

  var nbPoints = 0
  var nbFc = 0

  /** Abonné du module (événement « etat ») ; null quand le JS n'écoute pas. */
  var ecouteur: ((Map<String, Any?>) -> Unit)? = null

  private var dossier: File? = null
  private var points: FileWriter? = null
  private var fcs: FileWriter? = null

  fun racine(ctx: Context) = File(ctx.filesDir, "suivi")

  // Journal des coupures (padel du 30/10) : filesDir/suivi/journal.csv, une ligne « heure,événement,détail » par connexion,
  // perte, reprise, écran, veille ou relance du service. Rien de personnel : ni adresse ni nom du capteur, ni FC, ni position.
  // Hors des dossiers de suivi (tampons() ne liste que ceux-ci) ; effacé avec les données du téléphone (oublier).
  const val JOURNAL_MAX = 2000
  private var journalF: File? = null

  fun journalFichier(ctx: Context) = File(racine(ctx), "journal.csv")

  /** Ouvre le journal (service créé) ; au-delà de JOURNAL_MAX lignes, seule la seconde moitié reste. */
  @Synchronized
  fun ouvrirJournal(ctx: Context) {
    val f = journalFichier(ctx)
    journalF = f
    try {
      f.parentFile?.mkdirs()
      if (f.exists()) {
        val l = f.readLines()
        if (l.size > JOURNAL_MAX) f.writeText(l.takeLast(JOURNAL_MAX / 2).joinToString("\n", postfix = "\n"))
      }
    } catch (_: Exception) {}
  }

  /** `detail` : un code ou un nombre, jamais une virgule ni une donnée personnelle. */
  @Synchronized
  fun journal(evenement: String, detail: Any? = null) {
    val f = journalF ?: return
    try { f.appendText("${System.currentTimeMillis()},$evenement,${detail?.toString()?.replace(',', ';') ?: ""}\n") } catch (_: Exception) {}
  }

  fun tempsMs(maintenant: Long = System.currentTimeMillis()): Long =
    if (statut == "arrete" && debut == 0L) 0L else maxOf(0L, (pauseDebut ?: maintenant) - debut - pauseCumulMs)

  /** `depuis`, `pauses` : muscu, le chrono de la séance déjà commencée (le tampon garde l'heure réelle de chaque mesure). */
  fun ouvrir(ctx: Context, nouveauMode: String, nouveauTitre: String, depuis: Long? = null, pauses: Long = 0) {
    fermer()
    val maintenant = System.currentTimeMillis()
    id = maintenant.toString()
    mode = nouveauMode
    titre = nouveauTitre
    statut = "en_cours"
    debut = depuis?.takeIf { it in 1..maintenant } ?: maintenant
    pauseDebut = null
    pauseCumulMs = if (depuis != null) maxOf(0L, pauses) else 0
    distanceM = 0.0
    tours.clear()
    origine = null
    gpsEtat = if (nouveauMode == "course") "attente" else "coupe"
    lat = null; lon = null; precision = null; altGps = null; vitesse = null; fixT = null
    bpm = null; contact = null; fcT = null
    pression = null; altBaro = null
    nbPoints = 0; nbFc = 0
    dossier = File(racine(ctx), id!!).apply { mkdirs() }
    ecrireFichiers()
    sauver()
  }

  /** Reprend un suivi en cours après la mort du processus (service relancé par le système). */
  fun restaurer(ctx: Context): Boolean {
    val dir = racine(ctx).listFiles()?.filter { File(it, "etat.json").exists() }?.maxByOrNull { it.name } ?: return false
    val j = try { JSONObject(File(dir, "etat.json").readText()) } catch (e: Exception) { return false }
    if (j.optString("statut") == "arrete") return false
    id = dir.name
    mode = j.optString("mode", "course")
    titre = j.optString("titre", "Suivi")
    statut = j.optString("statut")
    debut = j.optLong("debut")
    pauseDebut = if (j.isNull("pauseDebut")) null else j.optLong("pauseDebut")
    pauseCumulMs = j.optLong("pauseCumulMs")
    distanceM = j.optDouble("distanceM", 0.0)
    adresse = if (j.isNull("adresse")) null else j.optString("adresse")
    nbPoints = j.optInt("nbPoints")
    nbFc = j.optInt("nbFc")
    tours.clear()
    val t = j.optJSONArray("tours") ?: JSONArray()
    for (i in 0 until t.length()) t.getJSONObject(i).let { tours.add(Tour(it.getInt("n"), it.getLong("s"), it.getDouble("d"))) }
    origine = null
    gpsEtat = if (mode == "course") "attente" else "coupe"
    dossier = dir
    ecrireFichiers()
    return true
  }

  private fun ecrireFichiers() {
    points = FileWriter(File(dossier, "points.csv"), true)
    fcs = FileWriter(File(dossier, "fc.csv"), true)
  }

  fun fermer() {
    try { points?.close() } catch (_: Exception) {}
    try { fcs?.close() } catch (_: Exception) {}
    points = null
    fcs = null
  }

  fun pause(): Boolean {
    if (statut != "en_cours") return false
    statut = "pause"
    pauseDebut = System.currentTimeMillis()
    origine = null
    sauver()
    return true
  }

  fun reprendre(): Boolean {
    if (statut != "pause") return false
    pauseCumulMs += System.currentTimeMillis() - (pauseDebut ?: System.currentTimeMillis())
    pauseDebut = null
    statut = "en_cours"
    sauver()
    return true
  }

  fun tour(): Tour? {
    if (statut != "en_cours") return null
    val t = Tour(tours.size + 1, tempsMs(), distanceM)
    tours.add(t)
    sauver()
    return t
  }

  fun terminer() {
    if (statut == "arrete") return
    // la fin est figée comme une pause sans reprise : en pause, le chrono s'est déjà arrêté au début de la pause
    if (statut == "en_cours") pauseDebut = System.currentTimeMillis()
    statut = "arrete"
    gpsEtat = "coupe"
    fcEtat = "coupe"
    sauver()
    fermer()
  }

  /** Nouveau fix GPS : point écrit (pas en pause), distance filtrée comme dans logique.ts. */
  fun position(la: Double, lo: Double, prec: Double, alt: Double?, vit: Double?) {
    val maintenant = System.currentTimeMillis()
    lat = la; lon = lo; precision = prec; altGps = alt; vitesse = vit; fixT = maintenant
    gpsEtat = "ok"
    if (statut != "en_cours") return
    val s = tempsMs(maintenant)
    val o = origine
    val d = if (o != null) haversineM(o[0], o[1], la, lo) else 0.0
    val dt = if (o != null) (s - o[2]) / 1000.0 else 0.0
    val saut = dt > 0 && d / dt > VITESSE_MAX_MS
    if (prec <= PRECISION_MAX_M) {
      if (!saut) {
        if (dt > 0) distanceM += d
        origine = doubleArrayOf(la, lo, s.toDouble())
        sauts = 0
      } else if (++sauts >= SAUTS_REANCRAGE) {
        origine = doubleArrayOf(la, lo, s.toDouble())
        sauts = 0
      }
    }
    points?.apply {
      write("$maintenant,$s,$la,$lo,${altBaro ?: ""},${alt ?: ""},$prec,${vit ?: ""}\n")
      flush()
    }
    nbPoints++
  }

  fun frequence(valeur: Int, c: Boolean?) {
    val maintenant = System.currentTimeMillis()
    bpm = valeur; contact = c; fcT = maintenant
    fcEtat = "connecte"
    if (statut == "arrete") return
    fcs?.apply {
      write("$maintenant,${tempsMs(maintenant)},$valeur\n")
      flush()
    }
    nbFc++
  }

  fun barometre(hPa: Double) {
    val p = pression?.let { it + 0.1 * (hPa - it) } ?: hPa
    pression = p
    altBaro = 44330.0 * (1 - Math.pow(p / 1013.25, 1 / 5.255))
  }

  /** Appelé chaque seconde : GPS perdu au-delà de 10 s sans fix. */
  fun verifierGps() {
    val t = fixT
    if (gpsEtat == "ok" && t != null && System.currentTimeMillis() - t > GPS_PERDU_MS) gpsEtat = "perdu"
  }

  fun sauver() {
    val dir = dossier ?: return
    val j = JSONObject()
      .put("statut", statut).put("mode", mode).put("titre", titre).put("debut", debut)
      .put("pauseDebut", pauseDebut ?: JSONObject.NULL).put("pauseCumulMs", pauseCumulMs)
      .put("distanceM", distanceM).put("adresse", adresse ?: JSONObject.NULL)
      .put("nbPoints", nbPoints).put("nbFc", nbFc)
      .put("tours", JSONArray(tours.map { JSONObject().put("n", it.n).put("s", it.s).put("d", it.d) }))
    try {
      val tmp = File(dir, "etat.json.tmp")
      tmp.writeText(j.toString())
      tmp.renameTo(File(dir, "etat.json"))
    } catch (_: Exception) {}
  }

  fun instantane(): Map<String, Any?> {
    val maintenant = System.currentTimeMillis()
    return mapOf(
      "statut" to statut, "id" to id, "mode" to mode,
      "debut" to if (debut == 0L) null else debut.toDouble(),
      "pauseDebut" to pauseDebut?.toDouble(), "pauseCumulMs" to pauseCumulMs.toDouble(),
      "tempsMs" to tempsMs(maintenant).toDouble(), "distanceM" to distanceM,
      "gps" to mapOf(
        "etat" to gpsEtat, "lat" to lat, "lon" to lon, "precision" to precision, "altitude" to altGps, "vitesse" to vitesse,
        "ageMs" to fixT?.let { (maintenant - it).toDouble() },
      ),
      "fc" to mapOf(
        "etat" to fcEtat, "bpm" to bpm, "contact" to contact, "ageMs" to fcT?.let { (maintenant - it).toDouble() },
        "appareil" to appareil, "adresse" to adresse,
      ),
      "baro" to mapOf("present" to baroPresent, "pression" to pression, "altitude" to altBaro),
      "tours" to tours.map { mapOf("n" to it.n, "s" to it.s.toDouble(), "d" to it.d) },
      "nbPoints" to nbPoints, "nbFc" to nbFc,
    )
  }

  fun emettre() {
    ecouteur?.invoke(instantane())
  }

  private fun haversineM(la1: Double, lo1: Double, la2: Double, lo2: Double): Double {
    val r = Math.PI / 180
    val h = sin((la2 - la1) * r / 2).let { it * it } + cos(la1 * r) * cos(la2 * r) * sin((lo2 - lo1) * r / 2).let { it * it }
    return 2 * 6_371_008.8 * asin(min(1.0, sqrt(h)))
  }
}
