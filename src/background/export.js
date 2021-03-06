import browser from "webextension-polyfill";
import moment from "moment";
import log from "loglevel";
import getSessions from "./getSessions";
import { getSettings } from "../settings/settings";

const logDir = "background/export";

export default async function exportSessions(id = null) {
  log.log(logDir, "exportSessions()", id);
  let sessions = await getSessions(id);
  if (sessions == undefined) return;
  if (!Array.isArray(sessions)) sessions = [sessions];

  const downloadUrl = URL.createObjectURL(
    new Blob([JSON.stringify(sessions, null, "    ")], {
      type: "aplication/json"
    })
  );

  const fileName = generateFileName(sessions);

  await browser.downloads
    .download({
      url: downloadUrl,
      filename: `${fileName}.json`,
      conflictAction: "uniquify",
      saveAs: true
    })
    .catch(e => {
      log.warn(logDir, "exportSessions()", e);
    });
}

function generateFileName(sessions) {
  log.log(logDir, "generateFileName", sessions);
  let fileName;
  if (sessions.length == 1) {
    fileName = `${sessions[0].name} - ${moment(sessions[0].date).format(
      getSettings("dateFormat")
    )}`;
  } else {
    const sessionsLabel = browser.i18n.getMessage("sessionsLabel");
    fileName = `${sessionsLabel} - ${moment().format(getSettings("dateFormat"))}`;
  }
  const pattern = /\\|\/|\:|\?|\.|"|<|>|\|/g;
  fileName = fileName.replace(pattern, "-").replace(/^( )+/, "");
  return fileName;
}
