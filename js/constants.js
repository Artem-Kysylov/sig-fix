/** @type {Record<string, { title: string; subtitle: string; button: string }>} */
export const DROPZONE_TEXTS = {
  ai: {
    title: 'Drop HTML file here',
    subtitle: 'AI will fix Outlook compatibility issues',
    button: 'Load Test Template',
  },
  cleaner: {
    title: 'Drop signature file here',
    subtitle: 'Remove forbidden CSS and fix table layout',
    button: 'Load Messy Template',
  },
  extractor: {
    title: 'Drop email file here',
    subtitle: 'Extract signature from raw email content',
    button: 'Load Email Sample',
  },
};

/**
 * Demo templates deliberately contain Outlook-breaking patterns:
 *
 * ai       — modern flexbox layout with styles in <style> block,
 *            gap, border-radius, flex-direction: column nested.
 *            Looks fine in Chrome; completely broken in Outlook.
 *
 * cleaner  — table-based (structurally OK), but uses max-width,
 *            margin: 0 auto, border-radius, box-shadow — all ignored
 *            or misrendered by Outlook.
 *
 * extractor — raw email dump with headers, body copy, then a
 *             messy HTML signature embedded in Calibri spans.
 *
 * @type {Record<string, string>}
 */
export const DEMO_TEMPLATES = {
  ai: `<style>
  .sig-wrap   { display: flex; gap: 16px; align-items: center; padding: 14px 0; font-family: Arial, sans-serif; font-size: 13px; color: #374151; }
  .sig-avatar { width: 72px; height: 72px; border-radius: 50%; flex-shrink: 0; }
  .sig-sep    { width: 1px; background: #e5e7eb; align-self: stretch; margin: 0 4px; }
  .sig-body   { display: flex; flex-direction: column; gap: 3px; }
  .sig-name   { font-size: 15px; font-weight: 700; color: #111827; margin: 0; }
  .sig-role   { color: #6b7280; margin: 0; }
  .sig-links  { display: flex; gap: 8px; align-items: center; margin-top: 5px; }
  .sig-links a { color: #0078d4; text-decoration: none; }
  .sig-dot    { color: #d1d5db; }
</style>
<div class="sig-wrap">
  <img class="sig-avatar" src="https://i.pravatar.cc/144?img=47" width="72" height="72" alt="Alex Johnson">
  <div class="sig-sep"></div>
  <div class="sig-body">
    <p class="sig-name">Alex Johnson</p>
    <p class="sig-role">Head of Product · SyntaxLabs</p>
    <div class="sig-links">
      <a href="tel:+15551234567">+1 (555) 123-4567</a>
      <span class="sig-dot">·</span>
      <a href="mailto:alex@syntaxlabs.io">alex@syntaxlabs.io</a>
      <span class="sig-dot">·</span>
      <a href="https://syntaxlabs.io">syntaxlabs.io</a>
    </div>
  </div>
</div>`,

  cleaner: `<table style="max-width: 520px; margin: 0 auto; font-family: Arial, sans-serif; font-size: 13px; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0,0,0,0.10);">
  <tr>
    <td style="padding: 14px 20px; border-left: 4px solid #0078d4; border-radius: 0 6px 6px 0; background: #fafafa;">
      <p style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: #111827;">Sarah Mitchell</p>
      <p style="margin: 0 0 8px; color: #6b7280;">Senior Partner · TechVentures Group</p>
      <p style="margin: 0;">
        <a href="tel:+442071234567" style="color: #0078d4; text-decoration: none; margin-right: 12px;">+44 207 123 4567</a>
        <a href="mailto:s.mitchell@techventures.co" style="color: #0078d4; text-decoration: none;">s.mitchell@techventures.co</a>
      </p>
    </td>
  </tr>
</table>`,

  extractor: `From: "Sarah M." <sarah.mitchell@techventures.co>
Sent: Monday, June 9, 2026 10:31 AM
To: team@company.com; cto@company.com
Subject: Re: Q3 Planning Session

Hey team,

Let's sync up Thursday at 2pm to walk through the Q3 deck.
I'll send a calendar invite shortly — please confirm your attendance.

Cheers,
<span style="font-size:14px; font-family:Calibri,sans-serif; color:#000000; font-weight:bold;">Sarah Mitchell</span><br>
<span style="font-size:12px; font-family:Calibri,sans-serif; color:#666666;">Senior Partner, TechVentures Group</span><br>
<span style="font-size:12px; font-family:Calibri,sans-serif; color:#333333;"><a href="tel:+442071234567" style="color:#0078d4; text-decoration:none;">+44 207 123 4567</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="mailto:sarah.mitchell@techventures.co" style="color:#0078d4; text-decoration:none;">sarah.mitchell@techventures.co</a></span><br>
<span style="font-size:10px; font-family:Calibri,sans-serif; color:#999999;">TechVentures Ltd | 10 Finsbury Square | London EC2A 1AF | techventures.co</span>
________________________________
This message and any attachments are confidential and intended solely for the use of the individual or entity to whom they are addressed. If you have received this message in error, please notify the sender and delete it.`,
};

export const MODE_TAB_POSITIONS = { ai: 0, cleaner: 1, extractor: 2 };

export const COPY_LABELS = {
  html: { active: 'Copy Outlook-Safe Code', success: 'Copied HTML!' },
  rich: { active: 'Copy Rich Text',         success: 'Copied Rich Text!' },
};
