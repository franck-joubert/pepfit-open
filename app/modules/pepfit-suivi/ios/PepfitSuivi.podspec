# Module local pepfit-suivi, version iPhone (Swift) : suivi GPS en arrière-plan, baromètre, FC Bluetooth (0x180D).
Pod::Spec.new do |s|
  s.name           = 'PepfitSuivi'
  s.version        = '1.0.0'
  s.summary        = 'Suivi GPS et FC de pepfit'
  s.description    = 'Suivi GPS en arrière-plan (CoreLocation), baromètre (CoreMotion) et fréquence cardiaque Bluetooth (CoreBluetooth)'
  s.author         = ''
  s.homepage       = 'https://pep.fit'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreLocation', 'CoreBluetooth', 'CoreMotion'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,swift}"
end
