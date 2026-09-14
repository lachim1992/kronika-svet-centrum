import { useEffect, useState } from "react";

/** Resolves a visual from either a built building or its catalog template. */
type BuildingWithImage = {
  image_url?: string | null;
  building_templates?: { image_url?: string | null } | null;
  template?: { image_url?: string | null } | null;
};

export function getBuildingImageUrl(building: BuildingWithImage | null | undefined): string | null {
  return building?.image_url || building?.building_templates?.image_url || building?.template?.image_url || null;
}

interface BuildingVisualProps {
  src?: string | null;
  alt: string;
  className?: string;
}

/** Missing/broken generated assets fall back to the existing text/icon card. */
export default function BuildingVisual({ src, alt, className = "" }: BuildingVisualProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) return null;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
