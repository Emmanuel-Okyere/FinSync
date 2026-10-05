import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { Contact } from "../Contact";

export const metadata = { title: "Terms of use · FinSync" };

export default function Terms() {
  const op = LEGAL.operator;
  return (
    <article className="sk-card sk-card--pad sk-legal">
      <h1>Terms of use</h1>
      <p className="sk-cap">Effective {LEGAL.effective}</p>

      <p>
        These terms are an agreement between you and {op} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for using the FinSync app and website. By creating an
        account or using FinSync, you accept these terms and our <Link className="sk-link" href="/privacy">privacy policy</Link>. If you don&apos;t
        agree, please don&apos;t use FinSync.
      </p>

      <h2>1. What FinSync is</h2>
      <p>
        FinSync is a personal budgeting tool. It helps you plan your income, record what you spend, track savings, debts, investments and insurance, and
        share a household budget. It works only with the information you enter or import.
      </p>
      <ul>
        <li>FinSync does not hold, move or pay money, and is not a bank, mobile money provider, lender, investment adviser or insurer.</li>
        <li>FinSync does not connect to your bank or mobile money account. Balances and values are what you enter.</li>
        <li>
          Suggestions such as &ldquo;safe to spend&rdquo;, budget schemes, cut ideas and payoff plans are general guidance based on your own figures.
          They are not financial, investment, legal or tax advice.
        </li>
      </ul>

      <h2>2. The tax and SSNIT calculator</h2>
      <p>
        The calculator estimates PAYE income tax and SSNIT contributions for resident employees in Ghana using the Ghana Revenue Authority rates and
        SSNIT rules we have built in, which are shown on the calculator. Your employer&apos;s payroll may differ because of rounding, reliefs, benefits
        in kind, other income or rule changes. Always check against your payslip, and speak to GRA or a tax professional for advice on your situation.
        We aren&apos;t responsible for decisions made only on the calculator&apos;s figures.
      </p>

      <h2>3. Who can use FinSync</h2>
      <p>You must be at least 18 years old and able to enter a binding agreement. You may only create one personal account, using a phone number you own.</p>

      <h2>4. Your account</h2>
      <ul>
        <li>Give accurate details and keep them up to date.</li>
        <li>Keep your password private and don&apos;t share your account. You are responsible for what happens under your account.</li>
        <li>Tell us straight away if you think someone else has access. You can sign out on all devices from Settings.</li>
      </ul>

      <h2>5. Your information</h2>
      <p>
        The budgets, entries and other information you add stay yours. You give us permission to store and process them only to run FinSync for you, as
        described in the <Link className="sk-link" href="/privacy">privacy policy</Link>. You can export your entries as CSV and delete your account at
        any time from Settings.
      </p>
      <p>
        If you join a household, the shared entries you add (name, amount, date and who paid) and your first name are visible to its other members.
      </p>

      <h2>6. Text messages</h2>
      <p>
        We may send SMS messages to your phone number for sign-in codes, household invites and, if you switch them on, bill reminders and budget alerts.
        You can turn alerts off in Settings at any time. Your mobile network&apos;s normal charges may apply to messages you receive.
      </p>

      <h2>7. Acceptable use</h2>
      <p>Don&apos;t:</p>
      <ul>
        <li>use FinSync for anything unlawful, or to store information you have no right to hold;</li>
        <li>try to access other people&apos;s accounts or data, or get around our security or rate limits;</li>
        <li>probe, scan or overload the service, or use automated tools to sign up or send messages;</li>
        <li>invite people to a household without their agreement, or use invites to send unwanted messages;</li>
        <li>copy, resell or reverse engineer the service, except where the law allows.</li>
      </ul>
      <p>We may suspend or close accounts that break these terms or put other users or the service at risk.</p>

      <h2>8. Availability and changes</h2>
      <p>
        We work to keep FinSync available and your data safe, but we can&apos;t promise it will always be uninterrupted or error-free. We may add,
        change or remove features. If we plan to stop the service, we&apos;ll give you reasonable notice so you can export your data.
      </p>

      <h2>9. Price</h2>
      <p>FinSync is currently free. If we introduce paid features, we&apos;ll tell you the price before you are charged and you won&apos;t be charged without agreeing.</p>

      <h2>10. Ending your account</h2>
      <p>
        You can delete your account at any time from Settings. This deletes your data as described in the privacy policy. We may close an account that
        breaks these terms, after giving notice where it&apos;s reasonable to do so.
      </p>

      <h2>11. Our responsibility to you</h2>
      <p>
        FinSync is provided &ldquo;as is&rdquo;. To the extent the law allows, we are not liable for indirect or consequential loss, or for loss caused
        by inaccurate information you enter, by relying on estimates or suggestions, or by events outside our reasonable control. Nothing in these terms
        limits rights you have under Ghanaian consumer protection law or liability that cannot legally be limited.
      </p>

      <h2>12. Law and disputes</h2>
      <p>
        These terms are governed by the laws of the Republic of Ghana. If you have a complaint, contact us first and we&apos;ll try to resolve it. Any
        dispute we can&apos;t resolve together will be handled by the courts of Ghana.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms. If a change matters, we&apos;ll tell you in the app or by SMS before it takes effect. If you keep using FinSync after
        that, you accept the updated terms.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these terms: <Contact />.
      </p>
    </article>
  );
}
