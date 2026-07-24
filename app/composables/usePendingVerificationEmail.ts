export function usePendingVerificationEmail() {
  return useState<string | null>('pending-verification-email', () => null)
}
