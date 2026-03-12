"use client";

import {
  CheckCircleIcon,
  GoogleLogoIcon,
  SignOutIcon,
  SpinnerGapIcon,
  UserCircleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import {
  getAccountEmail,
  getAccountInitials,
  getAccountName,
  getAuthErrorMessage,
} from "@/web/features/auth/lib/auth-presentation";
import {
  firebaseAuth,
  googleAuthProvider,
} from "@/web/features/auth/lib/firebase-auth";
import { cn } from "@/web/lib/utils";

type PendingAction = "idle" | "signing-in" | "signing-out";

interface AvatarProps {
  className?: string;
  user: User | null;
  variant: "dialog" | "trigger";
}

const AVATAR_DIMENSIONS = {
  dialog: 48,
  trigger: 32,
} as const;

function AccountAvatar({ className, user, variant }: AvatarProps) {
  const dimension = AVATAR_DIMENSIONS[variant];

  if (user?.photoURL) {
    return (
      <Image
        alt={`${getAccountName(user)} profile photo`}
        className={cn("rounded-full object-cover", className)}
        height={dimension}
        src={user.photoURL}
        width={dimension}
      />
    );
  }

  if (user) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-chart-2 font-semibold text-white text-xs",
          className
        )}
      >
        {getAccountInitials(user)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
        className
      )}
    >
      <UserCircleIcon className="size-5" weight="fill" />
    </div>
  );
}

export function GoogleAuthDialog() {
  const [open, setOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setCurrentUser(nextUser);
      setIsAuthReady(true);
    });

    return unsubscribe;
  }, []);

  const handleSignIn = async (): Promise<void> => {
    setPendingAction("signing-in");
    setErrorMessage(null);

    try {
      await signInWithPopup(firebaseAuth, googleAuthProvider);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setPendingAction("idle");
    }
  };

  const handleSignOut = async (): Promise<void> => {
    setPendingAction("signing-out");
    setErrorMessage(null);

    try {
      await signOut(firebaseAuth);
    } catch {
      setErrorMessage("Sign-out failed. Please try again.");
    } finally {
      setPendingAction("idle");
    }
  };

  const isBusy = pendingAction !== "idle";
  const statusLabel = isAuthReady
    ? currentUser
      ? "Logged in"
      : "Not logged in"
    : "Checking login";

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={
            currentUser
              ? `Signed in as ${getAccountName(currentUser)}`
              : "Open Google login dialog"
          }
          className="relative size-8 rounded-full"
          size="icon"
          variant="ghost"
        >
          <AccountAvatar
            className="size-8 ring-1 ring-border/60"
            user={currentUser}
            variant="trigger"
          />
          <span
            className={cn(
              "absolute right-0.5 bottom-0.5 size-2 rounded-full ring-2 ring-background",
              currentUser ? "bg-emerald-500" : "bg-border"
            )}
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 overflow-hidden p-0"
        sideOffset={8}
      >
        <div className="border-border border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-sm">Google account</p>
              <p className="text-muted-foreground text-xs/relaxed">
                Login is optional for Papyrus.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={currentUser ? "secondary" : "outline"}>
                {statusLabel}
              </Badge>
              <Button
                onClick={() => {
                  setOpen(false);
                }}
                size="icon-sm"
                variant="ghost"
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4">
          {isAuthReady ? (
            currentUser ? (
              <>
                <div className="flex items-center gap-3">
                  <AccountAvatar
                    className="size-12 ring-1 ring-border/60"
                    user={currentUser}
                    variant="dialog"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {getAccountName(currentUser)}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {getAccountEmail(currentUser)}
                    </p>
                  </div>
                </div>

                <Button
                  className="w-full"
                  disabled={isBusy}
                  onClick={handleSignOut}
                  variant="outline"
                >
                  {pendingAction === "signing-out" ? (
                    <SpinnerGapIcon className="animate-spin" weight="bold" />
                  ) : (
                    <SignOutIcon weight="bold" />
                  )}
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircleIcon className="size-4" weight="fill" />
                    <span>The spreadsheet works without login.</span>
                  </div>
                  <p className="text-muted-foreground text-xs/relaxed">
                    Connect a Google account now so the auth flow is ready for
                    future features.
                  </p>
                </div>

                <Button
                  className="w-full"
                  disabled={isBusy}
                  onClick={handleSignIn}
                >
                  {pendingAction === "signing-in" ? (
                    <SpinnerGapIcon className="animate-spin" weight="bold" />
                  ) : (
                    <GoogleLogoIcon weight="bold" />
                  )}
                  Continue with Google
                </Button>
              </>
            )
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <SpinnerGapIcon className="size-4 animate-spin" weight="bold" />
              <span>Checking your existing Google session…</span>
            </div>
          )}

          {errorMessage ? (
            <div className="flex items-start gap-2 border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive text-xs/relaxed">
              <WarningCircleIcon
                className="mt-0.5 size-4 shrink-0"
                weight="fill"
              />
              <p>{errorMessage}</p>
            </div>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
