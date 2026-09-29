"use client";

import { useState } from "react";
import type { PrivateBooking } from "@/lib/bookings";
import { formatMoney } from "@/lib/events";

/** What a participant owes and how to pay (e.g. the leader's Revolut.me link with a reference). */
export function PaymentBox({ booking }: { booking: Pick<PrivateBooking, "status" | "amount_cents" | "currency" | "payment_status" | "payment_reference" | "payment_link" | "payment_note"> }) {
  const [copied, setCopied] = useState(false);
  if (!booking.amount_cents || booking.payment_status === "not_required") return null;
  const amount = formatMoney(booking.amount_cents, booking.currency);

  if (booking.payment_status === "paid") return <p className="payment-box paid"><b>✓ Paid</b> {amount}. Thank you!</p>;
  if (booking.payment_status === "refunded") return <p className="payment-box"><b>Refunded</b> {amount}.</p>;
  if (booking.status === "waitlisted") return <p className="payment-box"><b>{amount}</b> to pay once your seat is confirmed. We&apos;ll email you.</p>;
  if (booking.status !== "confirmed") return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(booking.payment_reference ?? "");
      setCopied(true);
    } catch {
      // The reference stays visible to copy by hand.
    }
  };

  return (
    <div className="payment-box due">
      <b>Payment due: {amount}</b>
      <p>
        {booking.payment_link ? "Pay with the button below and put" : "When you pay, put"} this reference in the payment note so we can match it:{" "}
        <code>{booking.payment_reference}</code>{" "}
        <button type="button" className="link-button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </p>
      {booking.payment_note && <p>{booking.payment_note}</p>}
      {booking.payment_link && <a className="primary-button pay-button" href={booking.payment_link} target="_blank" rel="noreferrer">Pay {amount} ↗</a>}
    </div>
  );
}
