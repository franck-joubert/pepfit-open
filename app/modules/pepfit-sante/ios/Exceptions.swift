import ExpoModulesCore
import HealthKit

final class TypeInconnuException: GenericException<String> {
  override var reason: String {
    "Type HealthKit inconnu : \(param)"
  }
}

/** Accès refusé par HealthKit. « SecurityException » comme sur Android : le JS (logique.ts, `refusee`) relit alors les autorisations. */
final class RefuseeException: GenericException<String> {
  override var reason: String {
    "SecurityException: HealthKit refuse l'accès (\(param))"
  }
}

final class EchecHealthKitException: GenericException<String> {
  override var reason: String {
    "HealthKit : \(param)"
  }
}

/** Erreur HealthKit d'autorisation → RefuseeException ; les autres passent telles quelles. */
func traduire(_ erreur: Error) -> Error {
  if let e = erreur as? HKError, e.code == .errorAuthorizationDenied || e.code == .errorAuthorizationNotDetermined {
    return RefuseeException(e.localizedDescription)
  }
  return erreur
}

/** HealthKit répond « pas de donnée » par une erreur (HKStatisticsQuery) : ce n'en est pas une pour nous. */
func sansDonnee(_ erreur: Error) -> Bool {
  (erreur as? HKError)?.code == .errorNoData
}
