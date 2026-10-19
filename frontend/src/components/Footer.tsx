import { Link } from "react-router-dom";
import { Car, Bus, Mail, Phone, MapPin } from "lucide-react";
import { Logo } from "@/components/Logo";

const FOOTER_LINKS = {
  ride: [
    { label: "Ride", to: "/home" },
    { label: "Ride Options", to: "/ride-options" },
    { label: "Reserve a Ride", to: "/" },
    { label: "Safety", to: "/safety" },
    { label: "Help", to: "/help" },
  ],
  company: [
    { label: "About RideSetGo", to: "/home" },
    { label: "Blog", to: "/home" },
    { label: "Careers", to: "/home" },
    { label: "Newsroom", to: "/home" },
    { label: "Gift Cards", to: "/home" },
  ],
  legal: [
    { label: "Privacy Policy", to: "/home" },
    { label: "Terms of Service", to: "/home" },
    { label: "Cookie Policy", to: "/home" },
    { label: "Accessibility", to: "/home" },
  ],
};

const CONTACT_ITEMS = [
  { icon: <MapPin className="w-5 h-5" />, label: "Amritsar, Punjab, India" },
  { icon: <Mail className="w-5 h-5" />, label: "support@ridesetgo.example" },
  { icon: <Phone className="w-5 h-5" />, label: "+91 183 000 0000" },
];

export function Footer() {
  return (
    <footer className="bg-rsgo-950 border-t border-rsgo-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Logo size={24} />
              <span className="font-bold text-white text-lg tracking-tight">
                RideSetGo
              </span>
            </div>
            <p className="text-rose-200 text-sm mb-6 max-w-xs">
              RideSetGo — simple, reliable rides in Amritsar. Transparent pricing,
              no surprises.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-8 h-8 rounded-xl bg-rsgo-900 flex items-center justify-center text-rose-400 hover:bg-rose-600 hover:text-white transition-colors">
                <Car className="w-4 h-4" />
              </a>
              <a href="#" className="w-8 h-8 rounded-xl bg-rsgo-900 flex items-center justify-center text-rose-400 hover:bg-rose-600 hover:text-white transition-colors">
                <Bus className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-6">Ride Options</h3>
            <ul className="space-y-3">
              {FOOTER_LINKS.ride.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-rose-200 text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-6">Company</h3>
            <ul className="space-y-3">
              {FOOTER_LINKS.company.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-rose-200 text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-6">Legal</h3>
            <ul className="space-y-3">
              {FOOTER_LINKS.legal.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-rose-200 text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-rsgo-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-6">
            {CONTACT_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                {item.icon}
                <span className="text-rose-200 text-sm">{item.label}</span>
              </div>
            ))}
          </div>
          <p className="text-rose-300 text-xs">
            © 2026 RideSetGo. All rights reserved. Demo project — not affiliated
            with Uber, Ola, or Rapido.
          </p>
        </div>
      </div>
    </footer>
  );
}

