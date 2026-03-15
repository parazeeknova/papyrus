import { describe, expect, test } from "bun:test";
import {
  buildCloudSyncEventErrorMessage,
  buildCloudSyncRefreshFallbackMessage,
  getCloudSyncReasonMessage,
} from "./cloud-workbook-errors";

describe("cloud workbook errors", () => {
  test("maps service account and firestore reason codes to actionable messages", () => {
    expect(getCloudSyncReasonMessage("enoent")).toContain(
      "service account configuration"
    );
    expect(getCloudSyncReasonMessage("missing_firebase_project_id")).toContain(
      "Firestore project"
    );
    expect(
      getCloudSyncReasonMessage("missing_service_account_field_private_key")
    ).toContain("service account configuration");
    expect(
      getCloudSyncReasonMessage("invalid_service_account_private_key")
    ).toContain("parse the configured Google service account private key");
    expect(getCloudSyncReasonMessage("token_exchange_http_403")).toContain(
      "exchange the Google service account"
    );
    expect(getCloudSyncReasonMessage("firestore_http_403")).toContain(
      "denied access to Firestore"
    );
  });

  test("builds descriptive channel and dashboard fallback errors", () => {
    expect(
      buildCloudSyncEventErrorMessage(
        "list",
        "missing_service_account_credentials"
      )
    ).toContain('Cloud sync request "list" failed.');

    expect(
      buildCloudSyncRefreshFallbackMessage(
        new Error(
          'Cloud sync request "list" failed. Phoenix cloud sync cannot read the configured Google service account credentials. (code: enoent)'
        )
      )
    ).toContain("Showing local data instead.");

    expect(buildCloudSyncRefreshFallbackMessage(new Error("boom"))).toContain(
      "boom"
    );
  });
});
