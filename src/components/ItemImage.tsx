import { useState } from 'react';
import { getItemImageUrl, getItemTheme } from '../utils/itemImage';
import {
  Feather, Mountain, TreePine, Heart, Wheat, Fish, Bone,
  FlaskConical, Gem, Sword, Package
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Feather, Mountain, TreePine, Heart, Wheat, Fish, Bone,
  FlaskConical, Gem, Sword, Package,
};

interface ItemImageProps {
  item: { imgUrl?: string; dofusdbId?: number; _id?: string; name?: string; type?: string };
  className?: string;
  imgClassName?: string;
}

export default function ItemImage({ item, className = '', imgClassName = 'h-8 w-8 object-contain' }: ItemImageProps) {
  const [hasError, setHasError] = useState(false);
  const src = getItemImageUrl(item);

  if (!src || hasError) {
    const theme = getItemTheme(item.name, item.type);
    const Icon = ICON_MAP[theme.icon] ?? Package;
    return (
      <div className={`flex items-center justify-center ${theme.bg} ${theme.border} border ${className}`}>
        <Icon className={`h-5 w-5 ${theme.text}`} />
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={src}
        alt={item.name ?? ''}
        onError={() => setHasError(true)}
        className={imgClassName}
      />
    </div>
  );
}
