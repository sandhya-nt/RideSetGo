import { HelpCircle, Mail, Phone, MapPin } from "lucide-react";

export default function HelpPage() {
  const FAQS = [
    {
      q: "How do I book a ride?",
      a: "Open the Home page, enter your pickup and destination, choose a ride category, and confirm your booking. Fare estimates are shown before you book.",
    },
    {
      q: "Are the locations real?",
      a: "Yes. All pickup and drop-off locations come from our verified Amritsar dataset with real coordinates.",
    },
    {
      q: "How are fares calculated?",
      a: "Fare estimates use our ML model trained on Amritsar trip data, with category multipliers for Bike, Auto, Mini, Sedan, and SUV. These are demo estimates only.",
    },
    {
      q: "Can I view my trip history?",
      a: "Yes. Your ride history is available in the History section, showing past bookings with fares and status.",
    },
    {
      q: "Is this a real ride-hailing service?",
      a: "No. RideSetGo is a demonstration project. It does not connect to real drivers, provide live tracking, or process real payments.",
    },
    {
      q: "How do I contact support?",
      a: "Email us at support@ridesetgo.example or call +91 183 000 0000.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-rsgo-50">
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <HelpCircle className="w-8 h-8 text-rose-600" />
          </div>
          <h1 className="text-3xl font-bold text-rsgo-900 mb-4">Help &amp; Support</h1>
          <p className="text-lg text-rsgo-600 max-w-xl mx-auto">
            Answers about fares, booking, and your trips with RideSetGo.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="card-hover p-5 border-b border-gray-100 last:border-0">
              <button
                className="flex items-center justify-between w-full text-left"
              onClick={() => {}}
              aria-expanded={false}
            >
              <h4 className="font-medium text-rsgo-900">{faq.q}</h4>
              <span className="text-rsgo-600 text-sm">⌄</span>
            </button>
            <div className="mt-3 text-sm text-rsgo-600 leading-relaxed">
              {faq.a}
            </div>
          </div>
        ))}
        </div>

        <div className="mt-12 card p-8 text-center">
          <h3 className="font-bold text-rsgo-900 mb-4">Still need help?</h3>
          <p className="text-rsgo-600 mb-6">
            Contact our support team and we&rsquo;ll get back to you shortly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-rose-600" />
              <span className="text-rsgo-700">support@ridesetgo.example</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-rose-600" />
              <span className="text-rsgo-700">+91 183 000 0000</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-600" />
              <span className="text-rsgo-700">Amritsar, Punjab, India</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
