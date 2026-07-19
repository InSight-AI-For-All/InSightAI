# Branded Authentication Email Templates

These HTML files are the approved InSight AI templates for Supabase Auth confirmation, recovery, magic-link, and invitation messages. They use the production-hosted email header at `https://insightaiforall.com/brand/email-header.png` and remain readable when images are blocked.

Supabase hosted projects do not deploy these files from application builds. Apply each file in **Supabase Dashboard > Authentication > Email Templates**, then send a test message for every flow before publishing. Keep subjects direct and consistent: “Confirm your InSight AI email,” “Reset your InSight AI password,” “Your InSight AI sign-in link,” and “You’re invited to InSight AI.”

Google OAuth is the current product sign-in path, so these templates are prepared for future email authentication and admin invitations. Stripe controls subscription, invoice, failed-payment, and receipt emails separately; configure the same logo, navy `#03153C`, teal `#0CA6A7`, company name, support identity, and canonical domain in Stripe Dashboard branding and customer-email settings.