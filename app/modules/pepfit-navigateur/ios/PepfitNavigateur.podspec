# Module local de pepfit, version iPhone (docs/CODE-IOS-DIVERS.md).
Pod::Spec.new do |s|
  s.name           = 'PepfitNavigateur'
  s.version        = '1.0.0'
  s.summary        = "Pages du site (SFSafariViewController) et connexions OAuth (ASWebAuthenticationSession)"
  s.description    = s.summary
  s.author         = 'pepfit'
  s.homepage       = 'https://pep.fit'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'SafariServices', 'AuthenticationServices'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
