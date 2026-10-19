import { useEffect, useState } from "react";
import {
  Shield,
  Phone,
  Trash2,
  Edit,
  Save,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
} from "lucide-react";
import { safetyService } from "@/services/api";
import { ErrorAlert, LoadingSpinner, SuccessAlert } from "@/components/common";
import type { TrustedContact, SafetyReport } from "@/types";

export default function SafetyPage() {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Add contact form state
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addRelationship, setAddRelationship] = useState("");
  const [adding, setAdding] = useState(false);

  // Edit contact form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRelationship, setEditRelationship] = useState("");
  const [saving, setSaving] = useState(false);

  // Report form state
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [rideId, setRideId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const INDIAN_PHONE_REGEX = /^(\+91[\s\-]?)?[6-9]\d{9}$/;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [c, r] = await Promise.all([safetyService.contacts(), safetyService.reports()]);
      setContacts(c.data);
      setReports(r.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Safety data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const clearEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPhone("");
    setEditRelationship("");
  };

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!addName.trim()) {
      setError("Please enter a contact name.");
      return;
    }
    if (!INDIAN_PHONE_REGEX.test(addPhone.trim())) {
      setError("Please enter a valid Indian phone number (e.g. +91 98765 43210).");
      return;
    }
    setAdding(true);
    try {
      await safetyService.addContact({
        name: addName.trim(),
        phone: addPhone.trim(),
        relationship: addRelationship.trim() || undefined,
      });
      setAddName("");
      setAddPhone("");
      setAddRelationship("");
      setSuccess("Trusted contact added successfully.");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not add contact.");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (contact: TrustedContact) => {
    setEditingId(contact.id);
    setEditName(contact.name);
    setEditPhone(contact.phone);
    setEditRelationship(contact.relationship || "");
    setError("");
    setSuccess("");
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!editingId) return;
    if (!editName.trim()) {
      setError("Please enter a contact name.");
      return;
    }
    if (!INDIAN_PHONE_REGEX.test(editPhone.trim())) {
      setError("Please enter a valid Indian phone number (e.g. +91 98765 43210).");
      return;
    }
    setSaving(true);
    try {
      await safetyService.editContact(editingId, {
        name: editName.trim(),
        phone: editPhone.trim(),
        relationship: editRelationship.trim() || undefined,
      });
      clearEdit();
      setSuccess("Contact updated successfully.");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not update contact.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: number) => {
    setDeleteConfirmId(id);
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const deleteContact = async (id: number) => {
    setDeleteConfirmId(null);
    try {
      await safetyService.deleteContact(id);
      setSuccess("Contact deleted successfully.");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not delete contact.");
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!description.trim()) {
      setError("Please describe the issue.");
      return;
    }
    setSubmitting(true);
    try {
      await safetyService.report({
        ride_id: rideId ? Number(rideId) : undefined,
        category,
        description: description.trim(),
      });
      setCategory("general");
      setDescription("");
      setRideId("");
      setSuccess("Report submitted successfully.");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  const dismissMessage = () => {
    setError("");
    setSuccess("");
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex min-h-screen flex-col bg-rsgo-50">
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto w-full space-y-8">
        {/* Page Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-rsgo-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-rsgo-600" />
          </div>
          <h1 className="text-3xl font-bold text-rsgo-900 mb-2">Safety Center</h1>
          <p className="text-rsgo-600">
            Manage trusted contacts, review safety guidance, and report issues.
            RideSetGo is a demo app — no live tracking or emergency dispatch is provided.
          </p>
        </div>

        {error && <ErrorAlert message={error} onDismiss={dismissMessage} />}
        {success && <SuccessAlert message={success} onDismiss={dismissMessage} />}

        {/* Safety Overview & Notices */}
        <section className="card p-6">
          <div className="flex items-start gap-3 mb-6">
            <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-rsgo-900 mb-1">Safety Notices</h2>
              <p className="text-sm text-rsgo-600">
                Read these before using RideSetGo.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold">!</span>
              </div>
              <div className="text-sm text-amber-800">
                <strong className="font-semibold">Demo application.</strong>
                RideSetGo is a demonstration project. It does not connect to real drivers,
                provide live location sharing, or offer emergency response services.
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold">i</span>
              </div>
              <div className="text-sm text-blue-800">
                <strong className="font-semibold">Trusted contacts are stored privately.</strong>
                Your contacts are associated only with your account and are never shared
                with other users or third parties.
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-50 border border-rose-100">
              <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-bold">i</span>
              </div>
              <div className="text-sm text-rose-800">
                <strong className="font-semibold">Reports are linked to your bookings.</strong>
                When you submit an issue with a booking reference, it is associated with
                that real ride record in your history.
              </div>
            </div>
          </div>
        </section>

        {/* Trusted Contacts */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-rsgo-900">Trusted Contacts</h2>
            <p className="text-sm text-rsgo-600">
              {contacts.length} saved
            </p>
          </div>

          {/* Add Contact Form */}
          <form onSubmit={addContact} className="grid md:grid-cols-4 gap-3 mb-6">
            <input
              className="input-field"
              placeholder="Full name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              required
            />
            <input
              className="input-field"
              placeholder="Phone (+91 ...)"
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              required
            />
            <input
              className="input-field"
              placeholder="Relationship (optional)"
              value={addRelationship}
              onChange={(e) => setAddRelationship(e.target.value)}
            />
            <button
              type="submit"
              disabled={adding}
              className="btn-primary"
            >
              {adding ? "Adding…" : "Add Contact"}
            </button>
          </form>

          {/* Contacts List */}
          {contacts.length === 0 ? (
            <div className="empty-state text-center py-12">
              <Shield className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-rsgo-600">No trusted contacts yet.</p>
              <p className="text-xs text-rsgo-400 mt-1">
                Add a contact above to share trip details in case of emergency.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {contacts.map((contact) => {
                const isEditing = editingId === contact.id;
                return (
                  <li
                    key={contact.id}
                    className="border rounded-xl p-4"
                  >
                    {isEditing ? (
                      // Edit form
                      <form onSubmit={saveEdit} className="space-y-3">
                        <div className="grid md:grid-cols-4 gap-3">
                          <input
                            className="input-field"
                            placeholder="Name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            required
                          />
                          <input
                            className="input-field"
                            placeholder="Phone"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            required
                          />
                          <input
                            className="input-field"
                            placeholder="Relationship"
                            value={editRelationship}
                            onChange={(e) => setEditRelationship(e.target.value)}
                          />
                          <div className="flex items-end gap-2">
                            <button
                              type="submit"
                              disabled={saving}
                              className="btn-primary"
                            >
                              {saving ? "Saving…" : <Save className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={clearEdit}
                              className="text-rsgo-600 hover:text-rsgo-700"
                            >
                              <X className="w-4 h-4" /> Cancel
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      // View mode
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-rsgo-900">
                            {contact.name}
                          </p>
                          <p className="text-sm text-rsgo-600 flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {contact.phone}
                          </p>
                          {contact.relationship && (
                            <p className="text-xs text-rsgo-500 mt-1">
                              {contact.relationship}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(contact)}
                            className="text-rsgo-600 hover:text-rsgo-700 p-2 rounded-lg hover:bg-rsgo-50"
                            aria-label="Edit contact"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(contact.id)}
                            className="text-pink-600 hover:text-pink-700 p-2 rounded-lg hover:bg-pink-50"
                            aria-label="Delete contact"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Delete confirmation */}
                    {deleteConfirmId === contact.id && (
                      <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-100">
                        <p className="text-sm text-rose-800 mb-3">
                          Delete this trusted contact? This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => deleteContact(contact.id)}
                            className="flex-1 btn-primary text-sm"
                          >
                            Delete
                          </button>
                          <button
                            onClick={cancelDelete}
                            className="flex-1 text-sm text-rsgo-600 hover:text-rsgo-700 border border-rsgo-200 hover:bg-rsgo-50 py-2 rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Safety Tips */}
        <section className="card p-6">
          <h2 className="font-bold text-rsgo-900 mb-4">Safety Tips</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-rsgo-50 border border-rsgo-100">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-3">
                <Clock className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-rsgo-900 mb-1">Before Your Journey</h3>
              <p className="text-sm text-rsgo-600">
                Confirm your pickup and destination. Share trip details with a
                trusted contact when appropriate.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-rsgo-50 border border-rsgo-100">
              <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-rsgo-900 mb-1">During Your Journey</h3>
              <p className="text-sm text-rsgo-600">
                Stay aware of your surroundings. Use the Safety Center to report
                any concern immediately.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-rsgo-50 border border-rsgo-100">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 mb-3">
                <CheckCircle className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-rsgo-900 mb-1">After Your Journey</h3>
              <p className="text-sm text-rsgo-600">
                Review your trip in History. Submit a report if anything went
                wrong — your feedback helps improve safety.
              </p>
            </div>
          </div>
          <p className="text-xs text-rsgo-500 mt-4">
            No emergency services, live tracking or driver verification are provided
            in this demo. Contact local authorities in a real emergency.
          </p>
        </section>

        {/* Report an Issue */}
        <section className="card p-6">
          <div className="flex items-start gap-3 mb-6">
            <FileText className="w-6 h-6 text-rsgo-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-rsgo-900 mb-1">Report an Issue</h2>
              <p className="text-sm text-rsgo-600">
                Tell us about a problem with a booking or your account.
              </p>
            </div>
          </div>
          <form onSubmit={submitReport} className="space-y-3">
            <select
              className="input-field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="general">General</option>
              <option value="safety">Safety</option>
              <option value="booking">Booking</option>
              <option value="payment">Payment</option>
            </select>
            <input
              className="input-field"
              placeholder="Related booking ID (optional)"
              value={rideId}
              onChange={(e) => setRideId(e.target.value)}
            />
            <textarea
              className="input-field"
              rows={4}
              placeholder="Describe the issue in detail"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full"
            >
              {submitting ? "Submitting…" : "Submit Report"}
            </button>
          </form>

          {reports.length > 0 && (
            <div className="mt-6 border-t border-rsgo-100 pt-6">
              <h3 className="font-medium text-rsgo-900 mb-3">Your Reports</h3>
              <ul className="space-y-2">
                {reports.map((report) => (
                  <li key={report.id} className="border rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-rsgo-900">
                          {report.category}
                        </p>
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            report.status === "submitted"
                              ? "bg-amber-100 text-amber-700"
                              : report.status === "reviewed"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-green-100 text-green-700"
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>
                      <p className="text-xs text-rsgo-500">
                        {new Date(report.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <p className="text-sm text-rsgo-600 mt-1">
                      {report.description}
                    </p>
                    {report.ride_id && (
                      <p className="text-xs text-rsgo-500 mt-1">
                        Linked to booking #{report.ride_id}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
