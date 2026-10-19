export function FareBreakdown({
  baseFare,
  categoryFare,
  category,
  distance,
  duration,
}: {
  baseFare: number;
  categoryFare: number;
  category: string;
  distance: number;
  duration: number;
}) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Fare Breakdown</h3>
      <div className="space-y-3 mb-5">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Base fare ({category})</span>
          <span>₹{baseFare.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Distance: {distance.toFixed(1)} km</span>
          <span>Included</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>Est. duration</span>
          <span>{duration} min</span>
        </div>
      </div>
      <div className="flex justify-between items-center pt-4 border-t border-gray-100">
        <span className="font-semibold text-gray-800">Estimated Total</span>
        <span className="text-2xl font-bold text-rsgo-600">
          ₹{categoryFare.toLocaleString("en-IN")}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Estimated/demo pricing only. Not an official Uber, Ola, or Rapido quote.
      </p>
    </div>
  );
}

