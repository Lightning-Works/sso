-- Stone Spheres (Pizote Press collectibles game on costaricasailing.net and pura-verde.com), registered 2026-Nov-03.
-- Sign-in methods: email + Google. The game's "Continue with Google" button opens /login?app=stone-spheres&method=google
-- (straight to Google). The sites trade the returned token for a game session through their own server
-- (Supabase edge function sg-sso in the Pizote Press project, which calls /api/verify).
-- Kept thin on purpose: Pizote Press may be sold, so the game only depends on /login and /api/verify.

insert into companies (name, slug, logo_url, theme)
values ('Pizote Press', 'pizotepress', null, '{}'::jsonb)
on conflict (slug) do nothing;

insert into apps (company_id, name, slug, theme, redirect_origins, login_methods)
select id, 'Stone Spheres', 'stone-spheres',
  '{"primary_color": "#e0a94a", "primary_hover_color": "#f0b95a", "bg_color": "#1b1915", "panel_bg_color": "#26231e",
    "text_color": "#f4efe6", "text_secondary_color": "#c2b9a8", "text_muted_color": "#9d9484", "text_white_color": "#f4efe6",
    "input_text_color": "#f4efe6", "input_bg_color": "#1b1915", "divider_color": "#3a352d", "border_radius": "12px",
    "button_text_color": "#1b1915", "font_family": "''Barlow'', sans-serif", "font_size": "16px",
    "font_url": "https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&display=swap"}'::jsonb,
  array['https://costaricasailing.net', 'https://www.costaricasailing.net', 'https://costaricasailing.pages.dev',
        'https://*.costaricasailing.pages.dev', 'https://pura-verde.com', 'https://www.pura-verde.com',
        'https://pura-verde.pages.dev', 'https://*.pura-verde.pages.dev'],
  array['email', 'google']
from companies where slug = 'pizotepress'
on conflict (slug) do update set theme = excluded.theme, redirect_origins = excluded.redirect_origins,
  login_methods = excluded.login_methods, name = excluded.name;
