# Google Careers → Telegram role monitor

This personal monitor checks your Google Careers India/Early/Mid search, finds new roles whose **titles** match your Cloud/AI keywords, and messages your Telegram chat with the direct posting link.

It deliberately creates a baseline first, so current roles do not cause a flood of alerts. Afterward, every new match is sent once.

## One-time setup

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and save the token it gives you.
2. Open a chat with your new bot and send it any message (for example, `start`).
3. In a browser, open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`. In the response, copy `message.chat.id` — that is your `TELEGRAM_CHAT_ID`. Never share your bot token.
4. Copy `.env.example` to `.env`, then fill in the bot token and chat ID. You can also tune `ROLE_KEYWORDS` to match the team once your friend tells you its wording.
5. Run `npm run initialize`. It saves the current matching roles without notifying you.

## Run it automatically

Run `npm run check` every five minutes. On macOS, create the following LaunchAgent file at `~/Library/LaunchAgents/com.you.google-careers-monitor.plist`, replacing `/ABSOLUTE/PATH/TO/google-careers-automation` with this project’s full path:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.you.google-careers-monitor</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/env</string><string>npm</string><string>run</string><string>check</string>
  </array>
  <key>WorkingDirectory</key><string>/ABSOLUTE/PATH/TO/google-careers-automation</string>
  <key>StartInterval</key><integer>300</integer>
  <key>StandardOutPath</key><string>/tmp/google-careers-monitor.log</string>
  <key>StandardErrorPath</key><string>/tmp/google-careers-monitor-error.log</string>
</dict></plist>
```

Load it once:

```sh
launchctl load ~/Library/LaunchAgents/com.you.google-careers-monitor.plist
```

Your Mac must be awake and connected for an alert to be sent. The monitor does not apply to roles or contact anyone; it only sends your private Telegram alert.

## Run on GitHub Actions

GitHub Actions can run the monitor without your Mac. The included workflow checks every five minutes and commits the updated `data/seen-jobs.json` state after each run.

1. In your GitHub repository, open **Settings → Secrets and variables → Actions**.
2. Add these **Repository secrets**: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
3. Add these **Repository variables** (not secrets): `SEARCH_URL` and `ROLE_KEYWORDS`. Copy their values from `.env.example` or your local `.env`.
4. Commit and push `.github/workflows/check-google-careers.yml` and `data/seen-jobs.json`. Do not commit `.env`.
5. Open the repository’s **Actions** tab, select **Check Google Careers**, and click **Run workflow** once. Confirm it completes successfully and check Telegram.

The workflow needs **Read and write permissions** for Actions in **Settings → Actions → General → Workflow permissions**, so it can save the seen-role state. If this repository is public and inactive for 60 days, GitHub can disable scheduled workflows; manually running it re-enables them.

## Verify alerts

Run `npm run test:telegram` to send one safe test message. It does not check Google Careers or alter the saved baseline.

`npm run alert:current` sends one alert for each role that currently matches your keywords. This is optional: normal checks intentionally do not repeat those roles, and only alert when a newly posted matching role appears.
