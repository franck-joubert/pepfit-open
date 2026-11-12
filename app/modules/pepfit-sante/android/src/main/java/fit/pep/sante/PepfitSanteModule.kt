package fit.pep.sante

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.BodyWaterMassRecord
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByDurationRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import kotlin.reflect.KClass

// Santé Connect : accès bruts, sans logique. Le choix (dernière pesée, nuit, pas par jour) et le contrôle des
// autorisations se font côté JS (src/natif/sante/logique.ts), testé avec ce module simulé.
class PepfitSanteModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val client: HealthConnectClient
    get() = HealthConnectClient.getOrCreate(context)
  private val contrat = PermissionController.createRequestPermissionResultContract()
  private var enAttente: Promise? = null
  private var lanceur: ActivityResultLauncher<Set<String>>? = null

  override fun definition() = ModuleDefinition {
    Name("PepfitSante")

    /** 1 absent, 2 à mettre à jour, 3 disponible (constantes SDK_* de HealthConnectClient). */
    AsyncFunction("statut") { HealthConnectClient.getSdkStatus(context) }

    AsyncFunction("autorisees") Coroutine { -> client.permissionController.getGrantedPermissions().toList() }

    /**
     * Santé Connect sait-il donner l'historique (plus de 30 jours avant la première autorisation, READ_HEALTH_DATA_HISTORY) ?
     * Faux sur une version trop ancienne : la permission n'y est jamais proposée, l'appli ne la demande donc pas.
     */
    AsyncFunction("historiquePossible") {
      try {
        client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
      } catch (_: Exception) {
        false
      }
    }

    /**
     * Ouvre la demande de Santé Connect ; renvoie les autorisations accordées parmi celles demandées. Passe par le
     * registre de résultats de l'activité : depuis Android 14, l'intent du contrat n'est servi que par lui (un
     * startActivityForResult direct plante, ActivityNotFoundException).
     */
    AsyncFunction("demander") { permissions: List<String>, promise: Promise ->
      enAttente?.resolve(emptyList<String>())
      enAttente = promise
      lanceur?.unregister()
      val activite = appContext.throwingActivity as ComponentActivity
      lanceur = activite.activityResultRegistry.register("pepfit-sante-demande", contrat) { accordees ->
        lanceur?.unregister()
        lanceur = null
        enAttente?.resolve(accordees.toList())
        enAttente = null
      }.also { it.launch(permissions.toSet()) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("poids") Coroutine { debut: Double, fin: Double ->
      lire(WeightRecord::class, debut, fin).map {
        mapOf("kg" to it.weight.inKilograms, "date" to it.time.toEpochMilli().toDouble(), "origine" to it.metadata.dataOrigin.packageName)
      }
    }

    /** Pas totaux (dédoublonnés par Santé Connect) de chaque intervalle [bornes[i], bornes[i+1]] ; -1 sans donnée. */
    AsyncFunction("pas") Coroutine { bornes: List<Double> ->
      bornes.zipWithNext().map { (a, b) ->
        val r = client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), entre(a, b)))
        r.get(StepsRecord.COUNT_TOTAL)?.toDouble() ?: -1.0
      }
    }

    /**
     * Applis qui ont écrit des pas sur [debut, fin] (enregistrements bruts). L'agrégat ne compte que les applis des priorités
     * de Santé Connect : des pas écrits sans agrégat disent qu'il faut y ajouter l'appli de la montre (C12).
     */
    AsyncFunction("originesPas") Coroutine { debut: Double, fin: Double ->
      lire(StepsRecord::class, debut, fin).map { it.metadata.dataOrigin.packageName }.distinct()
    }

    /**
     * Applis qui écrivent réellement dans Santé Connect (carte « Capteurs » de la page Effort) : pour chaque type demandé (« pas »,
     * « fc », « sommeil », « sport »), les paquets des enregistrements les plus récents de [debut, fin], dédoublonnés. UNE page
     * d'enregistrements par type (lecture descendante, quelques dizaines) : la requête reste légère, le JS la garde en cache.
     */
    AsyncFunction("origines") Coroutine { debut: Double, fin: Double, types: List<String> ->
      suspend fun <T : Record> o(k: KClass<T>, n: Int) =
        client.readRecords(ReadRecordsRequest(k, entre(debut, fin), ascendingOrder = false, pageSize = n)).records.map { it.metadata.dataOrigin.packageName }
      types.flatMap {
        when (it) {
          "pas" -> o(StepsRecord::class, 200)
          "fc" -> o(HeartRateRecord::class, 30)
          "sommeil" -> o(SleepSessionRecord::class, 30)
          "sport" -> o(ExerciseSessionRecord::class, 30)
          else -> emptyList()
        }
      }.distinct()
    }

    /**
     * Enregistrements bruts de pas de [debut, fin], toutes applis : [début, fin, pas, appli]. L'agrégat ne compte que les applis des
     * priorités de Santé Connect : sans l'appli de la montre dedans (ou avant qu'elle ait écrit), il rend rien alors que les pas
     * sont là. La fusion des applis (montre, téléphone) se fait côté JS (fusionnerPasBruts).
     */
    AsyncFunction("pasBruts") Coroutine { debut: Double, fin: Double ->
      lire(StepsRecord::class, debut, fin).map {
        mapOf(
          "debut" to it.startTime.toEpochMilli().toDouble(),
          "fin" to it.endTime.toEpochMilli().toDouble(),
          "pas" to it.count.toDouble(),
          "origine" to it.metadata.dataOrigin.packageName,
        )
      }
    }

    /**
     * Pas de chaque heure de [debut, fin] en UNE demande (aggregateGroupByDuration) : [début de l'heure (ms), pas] des seules
     * heures avec une donnée. La page Pas lisait 400 jours et 30 × 24 heures par autant d'appels à aggregate (~1 100, l'un
     * après l'autre) : des dizaines de secondes sur le Fold, page restée sur son squelette (docs/PAS-CHARGEMENT.md).
     */
    AsyncFunction("pasHeures") Coroutine { debut: Double, fin: Double ->
      client.aggregateGroupByDuration(AggregateGroupByDurationRequest(setOf(StepsRecord.COUNT_TOTAL), entre(debut, fin), Duration.ofHours(1)))
        .mapNotNull { g -> g.result.get(StepsRecord.COUNT_TOTAL)?.let { listOf(g.startTime.toEpochMilli().toDouble(), it.toDouble()) } }
    }

    /**
     * Repli des pas (Y du backlog) : le compteur de pas du téléphone (TYPE_STEP_COUNTER), cumulé depuis le dernier démarrage,
     * lu une fois. null sans capteur, sans permission ACTIVITY_RECOGNITION (Android 10 et plus) ou sans réponse sous 3 s. La
     * suite (jour par jour, redémarrages) se fait côté JS (src/ecrans/pas-telephone.ts). Ne lit pas Santé Connect.
     */
    AsyncFunction("compteurPas") { promise: Promise ->
      val permis = android.os.Build.VERSION.SDK_INT < 29 ||
        context.checkSelfPermission("android.permission.ACTIVITY_RECOGNITION") == PackageManager.PERMISSION_GRANTED
      val gestionnaire = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      val capteur = gestionnaire?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      if (!permis || gestionnaire == null || capteur == null) {
        promise.resolve(null)
      } else {
        var fini = false
        val main = Handler(Looper.getMainLooper())
        val ecoute = object : SensorEventListener {
          override fun onSensorChanged(e: SensorEvent) {
            if (fini) return
            fini = true
            gestionnaire.unregisterListener(this)
            promise.resolve(e.values[0].toDouble())
          }
          override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        }
        gestionnaire.registerListener(ecoute, capteur, SensorManager.SENSOR_DELAY_NORMAL, main)
        main.postDelayed({
          if (!fini) {
            fini = true
            gestionnaire.unregisterListener(ecoute)
            promise.resolve(null)
          }
        }, 3000)
      }
    }

    AsyncFunction("sommeil") Coroutine { debut: Double, fin: Double ->
      lire(SleepSessionRecord::class, debut, fin).map { s ->
        mapOf(
          "debut" to s.startTime.toEpochMilli().toDouble(),
          "fin" to s.endTime.toEpochMilli().toDouble(),
          "origine" to s.metadata.dataOrigin.packageName,
          "etapes" to s.stages.map {
            mapOf("debut" to it.startTime.toEpochMilli().toDouble(), "fin" to it.endTime.toEpochMilli().toDouble(), "type" to it.stage)
          },
        )
      }
    }

    AsyncFunction("frequenceRepos") Coroutine { debut: Double, fin: Double ->
      lire(RestingHeartRateRecord::class, debut, fin).map {
        mapOf("bpm" to it.beatsPerMinute.toDouble(), "date" to it.time.toEpochMilli().toDouble(), "origine" to it.metadata.dataOrigin.packageName)
      }
    }

    /**
     * Échantillons de FC (toutes applis) de l'intervalle, à plat. Santé Connect ne rend que les enregistrements qui COMMENCENT
     * dans la plage lue : une montre qui regroupe ses échantillons par heure (ou par jour) ferait perdre le début d'une séance.
     * On lit donc depuis MARGE_FC_MS avant, puis on ne garde que les échantillons de [debut, fin] (docs/AUDIT-SANS-WHOOP.md,
     * C2). La lecture est descendante : le plafond de 5 000 enregistrements coupe la marge avant la plage.
     */
    AsyncFunction("fc") Coroutine { debut: Double, fin: Double ->
      val a = debut.toLong()
      val b = fin.toLong()
      lire(HeartRateRecord::class, debut - MARGE_FC_MS, fin).flatMap { r -> r.samples.map { it.time.toEpochMilli() to it.beatsPerMinute } }
        .filter { (t, _) -> t in a..b }
        .sortedBy { it.first }
        .map { (t, bpm) -> mapOf("t" to t.toDouble(), "bpm" to bpm.toDouble()) }
    }

    /**
     * Mesures datées d'un type : gras (%), maigre, os, eau (kg), bmr (kcal/j), vfc (ms, RMSSD), respiration (/min), taille (cm).
     * Une liste vide pour un type inconnu.
     */
    AsyncFunction("mesures") Coroutine { type: String, debut: Double, fin: Double ->
      suspend fun <T : Record> m(k: KClass<T>, valeur: (T) -> Double, temps: (T) -> Instant) =
        lire(k, debut, fin).map { mapOf("valeur" to valeur(it), "date" to temps(it).toEpochMilli().toDouble(), "origine" to it.metadata.dataOrigin.packageName) }
      when (type) {
        "gras" -> m(BodyFatRecord::class, { it.percentage.value }, { it.time })
        "maigre" -> m(LeanBodyMassRecord::class, { it.mass.inKilograms }, { it.time })
        "os" -> m(BoneMassRecord::class, { it.mass.inKilograms }, { it.time })
        "eau" -> m(BodyWaterMassRecord::class, { it.mass.inKilograms }, { it.time })
        "bmr" -> m(BasalMetabolicRateRecord::class, { it.basalMetabolicRate.inKilocaloriesPerDay }, { it.time })
        "vfc" -> m(HeartRateVariabilityRmssdRecord::class, { it.heartRateVariabilityMillis }, { it.time })
        "respiration" -> m(RespiratoryRateRecord::class, { it.rate }, { it.time })
        "taille" -> m(HeightRecord::class, { it.height.inMeters * 100 }, { it.time })
        else -> emptyList()
      }
    }

    /**
     * Règles de l'intervalle (suivi du cycle, permission READ_MENSTRUATION seule) : les périodes (début, fin) et les jours de
     * flux (0 inconnu à 3 abondant), avec l'identifiant du relevé pour ne pas le relire deux fois.
     */
    AsyncFunction("regles") Coroutine { debut: Double, fin: Double ->
      mapOf(
        "periodes" to lire(MenstruationPeriodRecord::class, debut, fin).map {
          mapOf("debut" to it.startTime.toEpochMilli().toDouble(), "fin" to it.endTime.toEpochMilli().toDouble(), "id" to it.metadata.id)
        },
        "flux" to lire(MenstruationFlowRecord::class, debut, fin).map {
          mapOf("date" to it.time.toEpochMilli().toDouble(), "flux" to it.flow, "id" to it.metadata.id)
        },
      )
    }

    /** Séances de sport (toutes applis) qui touchent l'intervalle. */
    AsyncFunction("seancesSport") Coroutine { debut: Double, fin: Double ->
      lire(ExerciseSessionRecord::class, debut, fin).map {
        mapOf(
          "debut" to it.startTime.toEpochMilli().toDouble(),
          "fin" to it.endTime.toEpochMilli().toDouble(),
          "type" to it.exerciseType,
          "titre" to it.title,
          "origine" to it.metadata.dataOrigin.packageName,
        )
      }
    }

    /** kcal actives (sans le métabolisme) de chaque intervalle [bornes[i], bornes[i+1]] ; -1 sans donnée. */
    AsyncFunction("kcalActives") Coroutine { bornes: List<Double> ->
      bornes.zipWithNext().map { (a, b) ->
        val r = client.aggregate(AggregateRequest(setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), entre(a, b)))
        r.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)?.inKilocalories ?: -1.0
      }
    }

    AsyncFunction("distance") Coroutine { bornes: List<Double> ->
      bornes.zipWithNext().map { (a, b) ->
        val r = client.aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), entre(a, b)))
        r.get(DistanceRecord.DISTANCE_TOTAL)?.inMeters ?: -1.0
      }
    }

    /** Séance de musculation ; même `id` = même enregistrement (réexporter remplace au lieu de doubler). */
    AsyncFunction("exporter") Coroutine { debut: Double, fin: Double, titre: String, id: String ->
      val a = Instant.ofEpochMilli(debut.toLong())
      val b = Instant.ofEpochMilli(fin.toLong())
      val zone = ZoneId.systemDefault().rules
      client.insertRecords(
        listOf(
          ExerciseSessionRecord(
            startTime = a,
            startZoneOffset = zone.getOffset(a),
            endTime = b,
            endZoneOffset = zone.getOffset(b),
            metadata = Metadata.manualEntryWithId(id),
            exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
            title = titre,
          )
        )
      )
      Unit
    }

    AsyncFunction("installees") { paquets: List<String> ->
      paquets.filter {
        try {
          context.packageManager.getPackageInfo(it, 0)
          true
        } catch (_: PackageManager.NameNotFoundException) {
          false
        }
      }
    }

    /** Ouvre l'appli `paquet` (pour y activer le partage vers Santé Connect), sinon les données de pepfit dans Santé Connect. */
    AsyncFunction("ouvrir") { paquet: String? ->
      val intent = paquet?.let { context.packageManager.getLaunchIntentForPackage(it) }
        ?: HealthConnectClient.getHealthConnectManageDataIntent(context)
      appContext.throwingActivity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private companion object {
    /** Un enregistrement de FC commencé jusqu'à 24 h avant la plage (une montre qui écrit par jour) y entre encore. */
    const val MARGE_FC_MS = 24 * 3_600_000.0
  }

  private fun entre(debut: Double, fin: Double) =
    TimeRangeFilter.between(Instant.ofEpochMilli(debut.toLong()), Instant.ofEpochMilli(fin.toLong()))

  private suspend fun <T : Record> lire(type: KClass<T>, debut: Double, fin: Double): List<T> {
    val tout = mutableListOf<T>()
    var page: String? = null
    do {
      val r = client.readRecords(ReadRecordsRequest(type, entre(debut, fin), ascendingOrder = false, pageSize = 1000, pageToken = page))
      tout += r.records
      page = r.pageToken
    } while (page != null && tout.size < 5000)
    return tout
  }
}
