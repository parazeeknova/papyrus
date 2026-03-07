"use client";

import type { CollaboratorIdentity } from "@papyrus/core/collaboration-types";
import {
  CircleNotchIcon,
  DiamondIcon,
  FlowerLotusIcon,
  MoonIcon,
  PlanetIcon,
  ShootingStarIcon,
  SparkleIcon,
  SpiralIcon,
  StarIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { getCollaboratorInitials } from "@/web/features/spreadsheet/lib/collaboration";
import { cn } from "@/web/lib/utils";

interface CollaboratorAvatarProps {
  className?: string;
  identity: CollaboratorIdentity;
  ringClassName?: string;
  size?: "lg" | "md" | "sm";
}

const SIZE_STYLES = {
  lg: "size-10 text-sm",
  md: "size-8 text-xs",
  sm: "size-6 text-[10px]",
} as const;

const IMAGE_SIZES = {
  lg: 40,
  md: 32,
  sm: 24,
} as const;

const ANONYMOUS_ICON_MAP = {
  diamond: DiamondIcon,
  "flower-lotus": FlowerLotusIcon,
  moon: MoonIcon,
  planet: PlanetIcon,
  sparkle: SparkleIcon,
  spiral: SpiralIcon,
  star: StarIcon,
  "shooting-star": ShootingStarIcon,
} as const;

export function CollaboratorAvatar({
  className,
  identity,
  ringClassName = "ring-2 ring-background",
  size = "md",
}: CollaboratorAvatarProps) {
  const sizeClassName = SIZE_STYLES[size];
  const imageSize = IMAGE_SIZES[size];

  if (identity.isAnonymous && identity.photoURL) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-full",
          ringClassName,
          sizeClassName,
          className
        )}
        style={{ backgroundColor: identity.color }}
        title={identity.name}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),transparent_58%)]" />
        <Image
          alt={`${identity.name} avatar`}
          className="relative z-10 size-full object-contain p-1"
          height={imageSize}
          src={identity.photoURL}
          width={imageSize}
        />
      </div>
    );
  }

  if (identity.photoURL) {
    return (
      <Image
        alt={`${identity.name} avatar`}
        className={cn(
          "rounded-full object-cover",
          ringClassName,
          sizeClassName,
          className
        )}
        height={imageSize}
        src={identity.photoURL}
        width={imageSize}
      />
    );
  }

  if (identity.isAnonymous) {
    const AnonymousIcon =
      ANONYMOUS_ICON_MAP[identity.icon as keyof typeof ANONYMOUS_ICON_MAP] ??
      CircleNotchIcon;

    return (
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full text-white",
          ringClassName,
          sizeClassName,
          className
        )}
        style={{ backgroundColor: identity.color }}
        title={identity.name}
      >
        <AnonymousIcon
          className={
            size === "lg" ? "size-5" : size === "md" ? "size-4" : "size-3.5"
          }
          weight="fill"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-semibold text-white",
        ringClassName,
        sizeClassName,
        className
      )}
      style={{ backgroundColor: identity.color }}
      title={identity.name}
    >
      {getCollaboratorInitials(identity.name)}
    </div>
  );
}
