// ADR-116: the release and installer share the platform-to-asset contract.
export const CORE_TARGETS = [
  ['linux', 'amd64'], ['linux', 'arm64'], ['darwin', 'amd64'], ['darwin', 'arm64'], ['windows', 'amd64'],
]
export function coreAsset(platform, arch) {
  const goos = platform === 'win32' ? 'windows' : platform
  const goarch = arch === 'x64' ? 'amd64' : arch
  if (!CORE_TARGETS.some(([os, cpu]) => os === goos && cpu === goarch)) throw new Error(`unsupported core platform: ${platform}/${arch}`)
  return `qh-${goos}-${goarch}${goos === 'windows' ? '.exe' : ''}`
}
