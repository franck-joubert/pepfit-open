Pod::Spec.new do |s|
  s.name           = 'PepfitSante'
  s.version        = '1.0.0'
  s.summary        = 'Santé (HealthKit) pour pepfit'
  s.description    = 'Lectures HealthKit et écriture des séances : équivalent iPhone du module Santé Connect'
  s.author         = 'pepfit'
  s.homepage       = 'https://pep.fit'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'

  # Mode de langage Swift 5 : les rappels de HealthKit passent dans des continuations sans le contrôle strict de Swift 6
  s.swift_version = '5.9'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = "**/*.{h,m,swift}"
end
