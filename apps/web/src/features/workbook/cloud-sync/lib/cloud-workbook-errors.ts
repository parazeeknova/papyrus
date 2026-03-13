const FILESYSTEM_CREDENTIAL_ERROR_CODES = new Set([
  "eacces",
  "enoent",
  "enotdir",
]);
const INTEGER_STATUS_CODE_PATTERN = /^\d+$/;

function isStatusCode(reasonCode: string, prefix: string): boolean {
  if (!reasonCode.startsWith(prefix)) {
    return false;
  }

  const suffix = reasonCode.slice(prefix.length);
  return INTEGER_STATUS_CODE_PATTERN.test(suffix);
}

export function getCloudSyncReasonMessage(reasonCode: string): string {
  if (
    FILESYSTEM_CREDENTIAL_ERROR_CODES.has(reasonCode) ||
    reasonCode === "missing_service_account_credentials" ||
    reasonCode.startsWith("missing_service_account_field_")
  ) {
    return "Phoenix cloud sync cannot read the configured Google service account credentials.";
  }

  if (reasonCode === "invalid_service_account_private_key") {
    return "Phoenix cloud sync could not parse the configured Google service account private key.";
  }

  if (
    reasonCode === "invalid_token_response" ||
    isStatusCode(reasonCode, "token_exchange_http_")
  ) {
    return "Phoenix cloud sync could not exchange the Google service account for a Firestore access token.";
  }

  if (
    reasonCode === "firestore_http_401" ||
    reasonCode === "firestore_http_403"
  ) {
    return "Phoenix cloud sync was denied access to Firestore. Check the service account roles and project configuration.";
  }

  if (reasonCode === "firestore_http_404") {
    return "Phoenix cloud sync could not find the configured Firestore project or workbook documents.";
  }

  if (isStatusCode(reasonCode, "firestore_http_")) {
    return "Phoenix cloud sync received an unexpected Firestore response.";
  }

  if (reasonCode === "cloud_workbooks_unavailable") {
    return "Phoenix cloud workbook storage is unavailable.";
  }

  return `Phoenix cloud sync returned "${reasonCode}".`;
}

export function buildCloudSyncEventErrorMessage(
  eventName: string,
  reasonCode: string
): string {
  return `Cloud sync request "${eventName}" failed. ${getCloudSyncReasonMessage(reasonCode)} (code: ${reasonCode})`;
}

export function buildCloudSyncRefreshFallbackMessage(error: unknown): string {
  const detail =
    error instanceof Error && error.message.length > 0
      ? ` ${error.message}`
      : "";

  return `Couldn't refresh synced documents. Showing local data instead.${detail}`;
}
