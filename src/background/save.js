import browser from "webextension-polyfill";
import uuidv4 from "uuid/v4";
import log from "loglevel";
import { SessionStartTime } from "./background.js";
import Sessions from "./sessions.js";
import { getSettings } from "src/settings/settings";
import { returnReplaceParameter } from "./replace.js";
import ignoreUrls from "./ignoreUrls";
import { pushRemovedQueue } from "./cloudSync.js";
import { getValidatedTag } from "./tag.js";

const logDir = "background/save";

export async function saveCurrentSession(name, tag, property) {
  log.log(logDir, "saveCurrentSession()", name, tag, property);
  const session = await loadCurrentSession(name, tag, property).catch(() => {
    return Promise.reject();
  });
  const editedSession = ignoreUrls(session);
  return await saveSession(editedSession);
}

export async function loadCurrentSession(name, tag, property) {
  log.log(logDir, "loadCurrentSession()", name, tag, property);
  let session = {
    windows: {},
    windowsNumber: 0,
    windowsInfo: {},
    tabsNumber: 0,
    name: name,
    date: Date.now(),
    lastEditedTime: Date.now(),
    tag: tag,
    sessionStartTime: SessionStartTime,
    id: uuidv4()
  };

  let queryInfo = {};
  switch (property) {
    case "saveAllWindows":
      break;
    case "saveOnlyCurrentWindow":
      queryInfo.currentWindow = true;
      break;
    case "saveOnlyCurrentTab":
      queryInfo.currentWindow = true;
      queryInfo.active = true;
      break;
  }

  const tabs = await browser.tabs.query(queryInfo);
  for (let tab of tabs) {
    //プライベートタブを無視
    if (!getSettings("ifSavePrivateWindow")) {
      if (tab.incognito) {
        continue;
      }
    }

    if (session.windows[tab.windowId] == undefined) session.windows[tab.windowId] = {};

    //replacedPageなら元のページを保存
    const parameter = returnReplaceParameter(tab.url);
    if (parameter.isReplaced) {
      tab.url = parameter.url;
    }

    session.windows[tab.windowId][tab.id] = tab;
    session.tabsNumber++;
  }

  session.windowsNumber = Object.keys(session.windows).length;

  for (let i in session.windows) {
    const window = await browser.windows.get(parseInt(i));
    session.windowsInfo[i] = window;
  }

  return new Promise((resolve, reject) => {
    if (session.tabsNumber > 0) resolve(session);
    else reject();
  });
}

async function sendMessage(message, options = {}) {
  await browser.runtime
    .sendMessage({
      message: message,
      ...options
    })
    .catch(() => {});
}

export async function saveSession(session, isSendResponce = true, saveBySync = false) {
  log.log(logDir, "saveSession()", session, isSendResponce);
  try {
    const shouldSaveDeviceName = getSettings("shouldSaveDeviceName");
    if (shouldSaveDeviceName && !saveBySync) {
      const deviceName = getSettings("deviceName");
      const validatedTag = getValidatedTag(deviceName, session);
      if (validatedTag !== "") session.tag.push(deviceName);
    }
    await Sessions.put(session);
    if (isSendResponce) sendMessage("saveSession", { session: session, saveBySync: saveBySync });
    return session;
  } catch (e) {
    log.error(logDir, "saveSession()", e);
    return Promise.reject(e);
  }
}

export async function removeSession(id, isSendResponce = true) {
  log.log(logDir, "removeSession()", id, isSendResponce);
  try {
    await Sessions.delete(id);
    pushRemovedQueue(id);
    if (isSendResponce) sendMessage("deleteSession", { id: id });
  } catch (e) {
    log.error(logDir, "removeSession()", e);
    return Promise.reject(e);
  }
}

export async function updateSession(
  session,
  isSendResponce = true,
  shouldUpdateEditedTime = true,
  saveBySync = false
) {
  log.log(logDir, "updateSession()", session, isSendResponce, shouldUpdateEditedTime);
  try {
    if (shouldUpdateEditedTime) session.lastEditedTime = Date.now();
    await Sessions.put(session);
    if (isSendResponce) sendMessage("updateSession", { session: session, saveBySync: saveBySync });
  } catch (e) {
    log.error(logDir, "updateSession()", e);
    return Promise.reject(e);
  }
}

export async function renameSession(id, name) {
  log.log(logDir, "renameSession()", id, name);
  let session = await Sessions.get(id).catch(() => {});
  if (session == undefined) return;
  session.name = name.trim();
  updateSession(session);
}

export async function deleteAllSessions() {
  log.log(logDir, "deleteAllSessions()");
  try {
    await Sessions.deleteAll();
    sendMessage("deleteAll");
  } catch (e) {
    log.error(logDir, "deleteAllSessions()", e);
  }
}
