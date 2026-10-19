import { ShieldCheck, Clock, Users, Package } from "lucide-react";

const FEATURE_ICONS: Record<string, React.ComponentType<any>> = {
  Bike: ShieldCheck,
  Auto: Clock,
  Mini: Users,
  Sedan: Users,
  SUV: Package,
};

export function CategoryFeatures({
  category,
}: {
  category: { name: string; display_name: string; multiplier: number; icon: string; min_fare: number };
}) {
  const Icon = FEATURE_ICONS[category.name] || ShieldCheck;

  const features: Record<string, string> = {
    Bike: "Quick solo rides",
    Auto: "Classic Amritsar ride",
    Mini: "Compact & affordable",
    Sedan: "Comfortable family ride",
    SUV: "Spacious group travel",
  };

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <Icon className="w-3 h-3" />
      <span>{features[category.name] || "Ride category"}</span>
    </div>
  );
}
