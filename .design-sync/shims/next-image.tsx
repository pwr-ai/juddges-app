// design-sync shim: replaces `next/image` in the design-system bundle with a plain <img>.
import * as React from "react";

type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  priority?: boolean;
  fill?: boolean;
  quality?: number;
  unoptimized?: boolean;
};

export default function Image({ src, priority, fill, quality, unoptimized, alt = "", ...rest }: ImageProps) {
  const url = typeof src === "string" ? src : src?.src;
  return <img src={url} alt={alt} {...rest} />;
}
