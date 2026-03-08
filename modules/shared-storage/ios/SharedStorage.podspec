Pod::Spec.new do |s|
  s.name           = 'SharedStorage'
  s.version        = '1.0.0'
  s.summary        = 'Shared UserDefaults bridge for React Native'
  s.homepage       = 'https://github.com/example'
  s.license        = 'MIT'
  s.author         = 'spot'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.4'
  s.source_files   = '**/*.swift'

  s.dependency 'ExpoModulesCore'
end
