/** Google Identity Services (One Tap / Sign in with Google) */
type GoogleCredentialResponse = {
  credential: string
  select_by?: string
  clientId?: string
}

type GooglePromptMomentNotification = {
  isDisplayMoment: () => boolean
  isDisplayed: () => boolean
  isNotDisplayed: () => boolean
  getNotDisplayedReason: () => string
  isSkippedMoment: () => boolean
  getSkippedReason: () => string
  isDismissedMoment: () => boolean
  getDismissedReason: () => string
}

type GoogleIdConfiguration = {
  client_id: string
  callback: (response: GoogleCredentialResponse) => void
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
  context?: 'signin' | 'signup' | 'use'
  itp_support?: boolean
  use_fedcm_for_prompt?: boolean
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfiguration) => void
          prompt: (listener?: (notification: GooglePromptMomentNotification) => void) => void
          cancel: () => void
        }
      }
    }
  }
}

export {}
