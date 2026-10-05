import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { Contact } from "../Contact";

export const metadata = { title: "Privacy policy · FinSync" };

export default function Privacy() {
  const op = LEGAL.operator;
  return (
    <article className="sk-card sk-card--pad sk-legal">
      <h1>Privacy policy</h1>
      <p className="sk-cap">Effective {LEGAL.effective}</p>

      <p>
        This policy explains what personal data FinSync collects, why, who it&apos;s shared with, and your rights. {op} is the data controller for
        FinSync and processes personal data in line with Ghana&apos;s Data Protection Act, 2012 (Act 843).
      </p>

      <h2>1. What we collect</h2>
      <table>
        <tbody>
          <tr>
            <th>Account details</th>
            <td>First and last name, phone number, email address if you add one, and your password stored only as a one-way hash. If you sign in with Google: your Google account ID, name and email.</td>
          </tr>
          <tr>
            <th>Money information you enter</th>
            <td>
              Income and payday, payslip figures you use in the tax calculator (basic salary, allowances, Tier 3 percentage), budget scheme and lines,
              transactions and notes, fixed expenses, savings, debts (including who you owe or who owes you), investments, and insurance policies
              (including insurer, policy number and details you add).
            </td>
          </tr>
          <tr>
            <th>Statement imports</th>
            <td>
              When you import a CSV statement, we read it in memory and don&apos;t keep the file. The entries we find are held for up to 7 days while you
              review them; the ones you import become normal entries.
            </td>
          </tr>
          <tr>
            <th>Household</th>
            <td>Household name, members, phone numbers you invite, shared entries and settle-up records.</td>
          </tr>
          <tr>
            <th>Security data</th>
            <td>
              IP address and browser/device details linked to your signed-in sessions, and counts of sign-in and code attempts. We use these to keep your
              account safe and stop abuse.
            </td>
          </tr>
        </tbody>
      </table>
      <p>We don&apos;t ask for or store your bank or mobile money PINs, card numbers or Ghana Card number.</p>

      <h2>2. How we use it</h2>
      <ul>
        <li>To run FinSync for you: your budget, calculations, reports, exports and household sharing (performing our agreement with you).</li>
        <li>To keep accounts and the service secure, prevent fraud and abuse, and fix problems (our legitimate interests).</li>
        <li>To send SMS messages you need or ask for: sign-in codes, household invites, and alerts you switch on (agreement and your consent).</li>
        <li>To meet legal obligations, for example responding to a lawful request from an authority.</li>
      </ul>
      <p>We don&apos;t sell your data, show ads, or use your data to build marketing profiles. We don&apos;t make decisions about you that have legal effects using automated processing.</p>

      <h2>3. Who we share it with</h2>
      <ul>
        <li><b>Service providers</b> that run FinSync for us under contract: Vercel (hosting), Neon (database), and GIANT SMS (text messages). If you use Google sign-in, Google confirms your identity. They may only use the data to provide their service to us.</li>
        <li><b>Household members</b> see the shared entries you add and your first name.</li>
        <li><b>Authorities</b>, if the law requires it, or to protect the safety and rights of users or others.</li>
        <li><b>A buyer or successor</b> if FinSync is transferred, under this same policy. We&apos;ll tell you before that happens.</li>
      </ul>

      <h2>4. Where your data is stored</h2>
      <p>
        Our hosting and database providers may store and process data on servers outside Ghana. Where that happens, we rely on their contractual
        security and data protection commitments to give your data a level of protection consistent with Act 843.
      </p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>Your account and money information: for as long as you keep your account.</li>
        <li>When you delete your account from Settings, we delete it from our live database straight away. Copies in our providers&apos; backups are removed when those backups expire, normally within a few weeks.</li>
        <li>One-time codes: deleted within a day of expiring. Unused sign-ups: deleted when they expire. Session records: deleted 7 days after they expire. Attempt counters: deleted within a day.</li>
      </ul>

      <h2>6. How we protect it</h2>
      <p>
        Data is encrypted in transit (HTTPS). Passwords are hashed with Argon2id; sign-in tokens are short-lived and stored in secure, HTTP-only cookies;
        one-time codes are hashed. Access to your data is limited to your own account, and we rate-limit sign-in and code attempts. No system is perfectly
        secure; if a breach affects your data, we&apos;ll notify you and the Data Protection Commission as the law requires.
      </p>

      <h2>7. Cookies</h2>
      <p>
        We use only essential cookies: one to keep you signed in for a few minutes at a time, one to renew that sign-in, and short-lived ones that hold
        sign-in steps in progress. We don&apos;t use advertising or analytics cookies.
      </p>

      <h2>8. Your rights</h2>
      <p>Under the Data Protection Act, 2012 (Act 843) you can:</p>
      <ul>
        <li>ask what personal data we hold about you and get a copy (you can also export your entries from Settings);</li>
        <li>ask us to correct data that is wrong (most details can be edited in the app);</li>
        <li>ask us to delete your data (you can delete your account from Settings);</li>
        <li>object to processing or withdraw consent, for example by turning off SMS alerts;</li>
        <li>
          complain to the Data Protection Commission of Ghana (dataprotection.org.gh) if you&apos;re unhappy with how we handle your data.
        </li>
      </ul>
      <p>To make a request, contact us at <Contact />. We may need to confirm your identity first, and we&apos;ll reply within the time the law requires.</p>

      <h2>9. Children</h2>
      <p>FinSync is for people aged 18 and over. We don&apos;t knowingly collect data from children; if you believe a child has an account, contact us and we&apos;ll delete it.</p>

      <h2>10. Changes to this policy</h2>
      <p>If we change this policy in a way that matters, we&apos;ll tell you in the app or by SMS before the change takes effect. The date at the top shows the latest version.</p>

      <h2>11. Contact</h2>
      <p>
        Privacy questions or requests: <Contact />. See also our <Link className="sk-link" href="/terms">terms of use</Link>.
      </p>
    </article>
  );
}
