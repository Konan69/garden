import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'

interface BrandIconProps extends React.ComponentProps<'span'> {
  animate?: boolean
  noSpin?: boolean
  bordered?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const borderedSizes = {
  sm: { wrapper: 'p-1.5', icon: 'size-3.5' },
  md: { wrapper: 'p-2', icon: 'size-4' },
  lg: { wrapper: 'p-2.5', icon: 'size-5' },
}

/**
 * Garden leaf mark — the app's brand icon.
 *
 * Why: Julian's direction during the Aug 2026 login redesign — Garden's mark
 * is a leaf, replacing the earlier CSS 8-pointed asterisk on every surface
 * (login, sidebar, marketing pages, and the generated favicon/PWA assets in
 * apps/web/public, which are rasterized from this same geometry).
 *
 * Drawn in the product's moss-ink line language: stroked blade, curved
 * midrib, three side veins, soft fill. Rides `currentColor` so it themes
 * automatically. The API is unchanged from the asterisk era so existing
 * call sites keep working: `animate` plays a one-time "sprout" entrance
 * (scale/rotate settle — see .animate-entrance-sprout in base.css), and
 * `noSpin` retains its historical meaning of "no hover motion" (the hover
 * effect is now a gentle tilt rather than a spin).
 */
export function BrandIcon({
  className,
  animate = false,
  noSpin = false,
  bordered = false,
  size = 'sm',
  ...props
}: BrandIconProps) {
  const [entranceDone, setEntranceDone] = useState(!animate)

  useEffect(() => {
    if (!animate) return
    const timer = setTimeout(() => setEntranceDone(true), 700)
    return () => clearTimeout(timer)
  }, [animate])

  const leaf = (iconClassName: string) => (
    <svg
      className={cn(
        iconClassName,
        !entranceDone && 'animate-entrance-sprout',
        entranceDone &&
          !noSpin &&
          'transition-transform duration-300 hover:-rotate-6',
      )}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19.5 4.5 C13 4.5 7.5 8 6.2 14 C5.6 16.7 6.3 18.9 6.9 19.8 C9.5 20.2 12.4 19.6 14.8 17.8 C18.4 15 19.8 9.8 19.5 4.5 Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7 19.6 C9 13.8 12.8 9 18.2 5.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M9.4 15.2 C10.8 15.4 12.4 15.1 13.7 14.3 M11.6 11.6 C13 11.8 14.6 11.5 15.9 10.7 M14.2 8.6 C15.3 8.8 16.6 8.6 17.7 8"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />
      <path
        d="M6.9 19.8 C5.9 20.9 5.3 21.9 5 22.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )

  if (bordered) {
    const sizeConfig = borderedSizes[size]
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-md border border-border',
          sizeConfig.wrapper,
          className,
        )}
        aria-hidden="true"
        {...props}
      >
        {leaf(sizeConfig.icon)}
      </span>
    )
  }

  return (
    <span
      className={cn('inline-block size-[1em]', className)}
      aria-hidden="true"
      {...props}
    >
      {leaf('size-full')}
    </span>
  )
}
