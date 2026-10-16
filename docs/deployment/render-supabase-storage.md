# Persistent file storage on Render

SynapseSync can keep profile pictures and document uploads in private Supabase Storage buckets. Without both Supabase settings, the API continues to use local filesystem storage. The Render filesystem is ephemeral, so local-mode uploads on Render can disappear after a restart or redeploy.

## 1. Create private buckets in Supabase

In the Supabase project, open **Storage** and create these buckets:

| Bucket | Public | File size limit | Allowed content types |
| --- | --- | ---: | --- |
| `profile-avatars` | Off (private) | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| `documents` | Off (private) | 20 MB | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/markdown`, `text/plain` |

The API validates file signatures, formats, and sizes before uploading. Keep the buckets private; users read files through the authenticated SynapseSync API, not through public Supabase URLs.

## 2. Set server environment variables in Render

Open the SynapseSync **Web Service** in Render, choose **Environment** in the left menu, and add:

| Key | Value |
| --- | --- |
| `SUPABASE_URL` | The project URL from Supabase **Project Settings → API** (for example, `https://your-project-ref.supabase.co`) |
| `SUPABASE_SECRET_KEY` | A server-only Supabase secret key (`sb_secret_…`) from the project's API keys page |

Save the changes and let Render rebuild/restart the service. Keep `SUPABASE_SECRET_KEY` only in the Render server environment. Do not put it in `VITE_*` variables, frontend source, `.env.example`, Git, browser storage, or client requests. The application sends this secret only from its API server to Supabase Storage.

For local development, copy `services/api/.env.example` to `services/api/.env` and fill in both values to test cloud storage. Leave both blank to use the local filesystem. Supplying only one cloud setting is a configuration error; the app will not silently fall back to ephemeral Render storage.

## 3. Important migration note

Adding these settings changes where new uploads are stored; it does not copy existing local or already-ephemeral Render files into Supabase. Re-upload those files after setup, or plan a separate, explicitly approved migration while the old files are still available.

## Troubleshooting

- A startup/configuration error mentioning `SUPABASE_URL` and `SUPABASE_SECRET_KEY` means one of the two server variables is missing.
- A Storage upload/read error usually means a bucket is missing, its name is different from the expected name, the bucket's size/type limits are too restrictive, or the service secret is invalid.
- Do not make a bucket public as a workaround. Check the API logs for the generic storage failure and verify the Render variables without copying the secret into logs or chat.
