"use client";

import { createWorkbookId } from "@papyrus/core/workbook-doc";
import { listWorkbookRegistryEntries } from "@papyrus/core/workbook-registry";
import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import {
  ArrowRightIcon,
  ClockClockwiseIcon,
  CloudIcon,
  FileTextIcon,
  PlusIcon,
  StarIcon,
  UserCircleIcon,
  UsersThreeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { onAuthStateChanged, type User } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/web/components/ui/card";
import { Separator } from "@/web/components/ui/separator";
import { firebaseAuth } from "@/web/features/auth/lib/firebase-auth";
import { listRemoteWorkbooks } from "@/web/features/spreadsheet/lib/firestore-workbook-sync";
import { useSpreadsheetStore } from "@/web/features/spreadsheet/store/spreadsheet-store";
import { cn } from "@/web/lib/utils";

type DocumentSource = "both" | "local" | "remote";

interface DashboardDocument extends WorkbookMeta {
  source: DocumentSource;
}

const ABSOLUTE_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const RELATIVE_DATE_FORMATTER = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

const LOADING_PLACEHOLDER_IDS = ["first", "second", "third"] as const;
const WHITESPACE_PATTERN = /\s+/;

function getTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatAbsoluteDate(value: string): string {
  const timestamp = getTimestamp(value);
  if (timestamp === 0) {
    return "Unknown";
  }

  return ABSOLUTE_DATE_FORMATTER.format(timestamp);
}

function formatRelativeDate(value: string): string {
  const timestamp = getTimestamp(value);
  if (timestamp === 0) {
    return "Unknown";
  }

  const diffMs = timestamp - Date.now();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (Math.abs(diffMs) < hourMs) {
    return RELATIVE_DATE_FORMATTER.format(
      Math.round(diffMs / minuteMs),
      "minute"
    );
  }

  if (Math.abs(diffMs) < dayMs) {
    return RELATIVE_DATE_FORMATTER.format(Math.round(diffMs / hourMs), "hour");
  }

  return RELATIVE_DATE_FORMATTER.format(Math.round(diffMs / dayMs), "day");
}

function getDocumentSourceBadge(source: DocumentSource): {
  label: string;
  variant: "default" | "outline" | "secondary";
} {
  switch (source) {
    case "both":
      return {
        label: "Synced",
        variant: "secondary",
      };
    case "remote":
      return {
        label: "Cloud",
        variant: "outline",
      };
    default:
      return {
        label: "Local",
        variant: "outline",
      };
  }
}

function mergeDocuments(
  localDocuments: WorkbookMeta[],
  remoteDocuments: WorkbookMeta[]
): DashboardDocument[] {
  const mergedDocuments = new Map<string, DashboardDocument>();

  for (const document of localDocuments) {
    mergedDocuments.set(document.id, {
      ...document,
      source: "local",
    });
  }

  for (const document of remoteDocuments) {
    const existingDocument = mergedDocuments.get(document.id);

    if (!existingDocument) {
      mergedDocuments.set(document.id, {
        ...document,
        source: "remote",
      });
      continue;
    }

    const remoteTimestamp = getTimestamp(document.updatedAt);
    const localTimestamp = getTimestamp(existingDocument.updatedAt);
    const preferredDocument =
      remoteTimestamp >= localTimestamp ? document : existingDocument;

    mergedDocuments.set(document.id, {
      ...preferredDocument,
      lastSyncedAt:
        document.lastSyncedAt ??
        existingDocument.lastSyncedAt ??
        preferredDocument.lastSyncedAt ??
        null,
      remoteVersion:
        document.remoteVersion ??
        existingDocument.remoteVersion ??
        preferredDocument.remoteVersion ??
        null,
      source: "both",
    });
  }

  return [...mergedDocuments.values()].sort((left, right) => {
    const updatedDelta =
      getTimestamp(right.updatedAt) - getTimestamp(left.updatedAt);
    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    return getTimestamp(right.lastOpenedAt) - getTimestamp(left.lastOpenedAt);
  });
}

function getAccountName(user: User | null): string {
  return user?.displayName ?? user?.email ?? "Guest session";
}

function getAccountEmail(user: User | null): string {
  return user?.email ?? "No Google account connected";
}

function getAccountInitials(user: User | null): string {
  const [first = "G", second = ""] = getAccountName(user)
    .trim()
    .split(WHITESPACE_PATTERN);

  return `${first[0] ?? "G"}${second[0] ?? ""}`.toUpperCase();
}

function AccountAvatar({ user }: { user: User | null }) {
  if (user?.photoURL) {
    return (
      <Image
        alt={`${getAccountName(user)} profile photo`}
        className="size-14 rounded-full object-cover ring-1 ring-border/70"
        height={56}
        src={user.photoURL}
        width={56}
      />
    );
  }

  return user ? (
    <div className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground ring-1 ring-border/70">
      <span className="font-semibold text-sm">{getAccountInitials(user)}</span>
    </div>
  ) : (
    <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border/70">
      <UserCircleIcon className="size-7" weight="fill" />
    </div>
  );
}

export function HomeDashboard() {
  const router = useRouter();
  const openWorkbook = useSpreadsheetStore((state) => state.openWorkbook);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<DashboardDocument[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let latestRequestId = 0;

    const loadDocuments = async (
      user: User | null,
      requestId: number
    ): Promise<void> => {
      let localDocuments: WorkbookMeta[] = [];
      let remoteDocuments: WorkbookMeta[] = [];
      let nextErrorMessage: string | null = null;

      try {
        localDocuments = await listWorkbookRegistryEntries();
      } catch {
        nextErrorMessage = "Couldn't read local documents in this browser.";
      }

      if (user) {
        try {
          remoteDocuments = await listRemoteWorkbooks(user.uid);
        } catch {
          nextErrorMessage ??=
            "Couldn't refresh synced documents. Showing local data instead.";
        }
      }

      if (isCancelled || requestId !== latestRequestId) {
        return;
      }

      startTransition(() => {
        setDocuments(mergeDocuments(localDocuments, remoteDocuments));
        setIsLoadingDocuments(false);
        setLoadErrorMessage(nextErrorMessage);
      });
    };

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      if (isCancelled) {
        return;
      }

      setCurrentUser(nextUser);
      setIsAuthReady(true);
      setIsLoadingDocuments(true);
      latestRequestId += 1;
      const nextRequestId = latestRequestId;

      loadDocuments(nextUser, nextRequestId).catch(() => {
        if (isCancelled || nextRequestId !== latestRequestId) {
          return;
        }

        setIsLoadingDocuments(false);
        setLoadErrorMessage("Couldn't load documents.");
      });
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, []);

  const handleCreateDocument = async (): Promise<void> => {
    const workbookId = createWorkbookId();

    setIsCreatingDocument(true);

    try {
      await openWorkbook(workbookId);
      router.push(`/workbook/${workbookId}`);
    } finally {
      setIsCreatingDocument(false);
    }
  };

  let signedInLabel = "Checking";
  if (isAuthReady) {
    signedInLabel = currentUser ? "Logged in" : "Guest";
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-6 px-5 py-8 sm:px-8 sm:py-10">
        <Card className="w-full overflow-hidden border-border/60 bg-card">
          <CardContent className="grid gap-8 px-6 py-6 md:grid-cols-[minmax(0,1.3fr)_320px] md:px-8 md:py-8">
            <section className="space-y-5">
              <Link className="inline-flex" href="/">
                <Badge className="gap-2 px-2.5 py-1" variant="ghost">
                  <Image
                    alt="Papyrus logo"
                    className="size-4"
                    height={16}
                    src="/apple-touch-icon.png"
                    width={16}
                  />
                  Papyrus
                </Badge>
              </Link>

              <div className="space-y-3">
                <h1 className="max-w-xl font-serif text-4xl tracking-tight sm:text-5xl">
                  Documents, kept close and easy to reopen.
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                  A minimal front page for your recent workbooks, with the
                  current session in view and the latest edits surfaced first.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
                <span className="inline-flex items-center gap-2">
                  <FileTextIcon
                    className="size-4 text-primary"
                    weight="duotone"
                  />
                  {documents.length} document{documents.length === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <ClockClockwiseIcon
                    className="size-4 text-primary"
                    weight="duotone"
                  />
                  Sorted by last modified
                </span>
              </div>
            </section>

            <section aria-label="Current user details">
              <Card className="h-full border-border/70 bg-background shadow-none">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>Current session</CardTitle>
                      <CardDescription>
                        Visible to everyone. Account status is optional.
                      </CardDescription>
                    </div>
                    <Badge variant={currentUser ? "secondary" : "outline"}>
                      {signedInLabel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center gap-4">
                    <AccountAvatar user={currentUser} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {getAccountName(currentUser)}
                      </p>
                      <p className="truncate text-muted-foreground text-sm">
                        {getAccountEmail(currentUser)}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-none border border-border/60 bg-muted/30 p-3">
                      <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                        Workspace
                      </p>
                      <p className="mt-2 font-medium text-sm">Public home</p>
                    </div>
                    <div className="rounded-none border border-border/60 bg-muted/30 p-3">
                      <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                        Documents
                      </p>
                      <p className="mt-2 font-medium text-sm">
                        {documents.length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          </CardContent>
        </Card>

        <Card className="w-full border-border/60 bg-card">
          <CardHeader className="gap-4 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Your documents</CardTitle>
              <CardDescription>
                Existing workbooks with their latest modified time.
              </CardDescription>
            </div>
            <Button
              disabled={isCreatingDocument}
              onClick={handleCreateDocument}
            >
              <PlusIcon weight="bold" />
              {isCreatingDocument ? "Creating..." : "New document"}
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {loadErrorMessage ? (
              <div className="flex items-start gap-2 rounded-none border border-destructive/20 bg-destructive/5 px-3 py-3 text-destructive text-sm">
                <WarningCircleIcon
                  className="mt-0.5 size-4 shrink-0"
                  weight="fill"
                />
                <p>{loadErrorMessage}</p>
              </div>
            ) : null}

            {isLoadingDocuments ? (
              <div className="grid gap-3">
                {LOADING_PLACEHOLDER_IDS.map((placeholderId) => (
                  <div
                    className="h-24 animate-pulse rounded-none border border-border/60 bg-muted/40"
                    key={placeholderId}
                  />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-none border border-border/70 border-dashed bg-muted/20 px-6 py-10 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FileTextIcon className="size-6" weight="duotone" />
                </div>
                <h3 className="mt-4 font-medium text-lg">No documents yet</h3>
                <p className="mt-2 text-muted-foreground text-sm">
                  Start a workbook and it will appear here with its last
                  modified time.
                </p>
                <Button
                  className="mt-5"
                  disabled={isCreatingDocument}
                  onClick={handleCreateDocument}
                >
                  <PlusIcon weight="bold" />
                  Create your first document
                </Button>
              </div>
            ) : (
              <ul className="overflow-hidden rounded-none border border-border/70">
                {documents.map((document, index) => {
                  const sourceBadge = getDocumentSourceBadge(document.source);

                  return (
                    <li
                      className={cn(
                        "grid gap-4 bg-background/60 px-4 py-4 transition-colors sm:px-5 md:grid-cols-[minmax(0,1fr)_180px_auto]",
                        index > 0 && "border-border/70 border-t",
                        "hover:bg-muted/30"
                      )}
                      key={document.id}
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate font-medium text-sm sm:text-base">
                            {document.name}
                          </p>
                          {document.isFavorite ? (
                            <StarIcon
                              className="size-4 shrink-0 text-primary"
                              weight="fill"
                            />
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={sourceBadge.variant}>
                            {sourceBadge.label}
                          </Badge>
                          {document.sharingEnabled ? (
                            <Badge className="gap-1.5" variant="outline">
                              <UsersThreeIcon weight="duotone" />
                              Shared
                            </Badge>
                          ) : null}
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                            <CloudIcon className="size-3.5" weight="duotone" />
                            {document.id}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 text-sm">
                        <p className="font-medium">
                          {formatRelativeDate(document.updatedAt)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatAbsoluteDate(document.updatedAt)}
                        </p>
                      </div>

                      <div className="flex items-center md:justify-end">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/workbook/${document.id}`}>
                            Open
                            <ArrowRightIcon weight="bold" />
                          </Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div aria-hidden className="flex w-full items-center">
        <div className="h-2 w-full bg-primary" />
        <div className="h-0.5 flex-1 bg-border" />
      </div>
    </main>
  );
}
