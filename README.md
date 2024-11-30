# gdrive-webdav

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/colobas/gdrive-webdav)

Use Cloudflare Workers to provide a WebDav interface for Google Drive.

## Getting `refresh_token`

1. Install [rclone](https://rclone.org/downloads/).

2. Create your own [Google Drive client_id](https://rclone.org/drive/#making-your-own-client-id).

3. Create a [Google Drive remote](https://rclone.org/drive/#configuration) in rclone and fill in `client_id` and `client_secret` with the one you made before.

4. Copy the `refresh_token` in this step (it's the last step).

```bash
...
[remote]

client_id =
client_secret =
scope = drive
root_folder_id =
service_account_file =
token = {"access_token":"XXX","token_type":"Bearer","refresh_token":"XXX","expiry":"2014-03-16T13:57:58.955387075Z"}
---

y) Yes this is OK
e) Edit this remote

## Usage

Change wrangler.toml to your own.

```bash
wrangler deploy

# to authenticate the WebDav client
wrangler secret put USERNAME
wrangler secret put PASSWORD

# to authenticate the Google Drive API
wrangler secret put CLIENT_ID
wrangler secret put CLIENT_SECRET
wrangler secret put REFRESH_TOKEN
wrangler secret put ROOT_FOLDER_ID
```

## Development

With `wrangler`, you can build, test, and deploy your Worker with the following commands:

```sh
# run your Worker in an ideal development workflow (with a local server, file watcher & more)
$ npm run dev

# deploy your Worker globally to the Cloudflare network (update your wrangler.toml file for configuration)
$ npm run deploy
```

## Test

Use [litmus](https://github.com/notroj/litmus) to test.
