import { Car, Bike, Truck, Bus } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Bike: Bike,
  Auto: Truck,
  Mini: Car,
  Sedan: Car,
  SUV: Bus,
};

export function RideCategoryCard({
  category,
  isSelected,
  onSelect,
}: {
  category: { name: string; display_name: string; multiplier: number; icon: string; min_fare: number };
  isSelected: boolean;
  onSelect: (name: string) => void;
}) {
  const Icon = ICON_MAP[category.name] || Car;

  return (
    <button
      onClick={() => onSelect(category.name)}
      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all duration-200 ${
        isSelected
          ? "bg-rsgo-50 border-rsgo-600 shadow-rsgo"
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
    >
      <Icon className={`w-6 h-6 ${isSelected ? "text-rsgo-600" : "text-gray-500"}`} />
      <span className="text-sm font-medium text-gray-800">
        {category.display_name}
      </span>
      <span className="text-xs text-gray-500">
        Min ₹{category.min_fare}
      </span>
    </button>
  );
}

