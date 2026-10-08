export interface FormSubmissionPolicy {
  isDevelopment: boolean;
  isLegacyPreview: boolean;
  isEnabled: boolean;
}

export const isBackstageFormSubmissionEnabled = ({
  isDevelopment,
  isLegacyPreview,
  isEnabled,
}: FormSubmissionPolicy): boolean => !isDevelopment && !isLegacyPreview && isEnabled;
