import Image from 'next/image';
import logo from '@/public/logo.png';

const SIZES = { sm: 28, md: 40, lg: 72 } as const;

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg'; inverted?: boolean }) {
  const height = SIZES[size];
  return (
    <Image
      src={logo}
      alt="Acme Hire"
      height={height}
      style={{ height, width: 'auto' }}
      priority
      className="animate-logo-in"
    />
  );
}
