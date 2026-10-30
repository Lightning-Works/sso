-- Per-app sign-in methods on the login page (and the Tropisphere app that first uses it).
-- login_methods: any of 'email', 'google', 'discord', 'apple', 'x', 'wax'. NULL or empty = show every method (old behaviour).
alter table apps add column if not exists login_methods text[];
comment on column apps.login_methods is 'Sign-in methods the login page shows for this app; null/empty = all.';

insert into companies (name, slug, logo_url, theme)
values ('Tropisphere', 'tropisphere', 'tropisphere_logo_1200px.webp', '{}'::jsonb)
on conflict (slug) do update set logo_url = excluded.logo_url;

insert into apps (company_id, name, slug, theme, redirect_origins, login_methods)
select id, 'Tropisphere', 'tropisphere',
  '{"primary_color": "#0b4c97", "primary_hover_color": "#072a57", "bg_color": "#eef4fb", "panel_bg_color": "#ffffff",
    "text_color": "#16263a", "text_secondary_color": "#4a5d75", "text_muted_color": "#6b7d94", "text_white_color": "#072a57",
    "input_text_color": "#16263a", "divider_color": "#c9d9ec", "border_radius": "12px", "font_family": "''Jost'', sans-serif",
    "font_size": "16px", "button_text_color": "#ffffff", "input_bg_color": "#f4f8fd", "font_url": "https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap"}'::jsonb,
  array['https://dev.tropisphere.com', 'https://www.tropisphere.com', 'https://tropisphere.com'], array['email', 'google']
from companies where slug = 'tropisphere'
on conflict (slug) do update set theme = excluded.theme, redirect_origins = excluded.redirect_origins, login_methods = excluded.login_methods;
