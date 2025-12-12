import { message } from '../message';

import { state } from '../state';
import { bookmark } from '../bookmark';
import { menu } from '../menu';
import { version } from '../version';
import { update } from '../update';
import { APP_NAME } from '../../constant';

import { Modal } from '../modal';
import { ImportForm } from '../importForm';

import { dateTime } from '../../utility/dateTime';
import { node } from '../../utility/node';
import { complexNode } from '../../utility/complexNode';
import { isJson } from '../../utility/isJson';
import { clearChildNode } from '../../utility/clearChildNode';

const data = {};

const resolveAppPayload = (rawPayload) => {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return false;
  }

  const appKey = APP_NAME;
  const appKeyLower = APP_NAME.toLowerCase();

  if (rawPayload[appKey] || rawPayload[appKeyLower]) {
    return rawPayload;
  }

  if (rawPayload.data) {
    if (typeof rawPayload.data === 'object') {
      return resolveAppPayload(rawPayload.data);
    }

    if (typeof rawPayload.data === 'string' && isJson(rawPayload.data)) {
      return resolveAppPayload(JSON.parse(rawPayload.data));
    }
  }

  return false;
};

data.set = (key, data) => {
  window.localStorage.setItem(key, data);
};

data.get = (key) => {
  return window.localStorage.getItem(key);
};

data.import = {
  state: {
    setup: { include: true },
    bookmark: { include: true, type: 'restore' },
    theme: { include: true }
  },
  reset: () => {
    data.import.state.setup.include = true;

    data.import.state.bookmark.include = true;

    data.import.state.bookmark.type = 'restore';

    data.import.state.theme.include = true;
  },
  file: ({
    fileList = false,
    feedback = false,
    input = false
  } = {}) => {
    if (fileList.length > 0) {
      data.validate.file({
        fileList: fileList,
        feedback: feedback,
        input: input
      });
    }
  },
  drop: ({
    fileList = false,
    feedback = false
  }) => {
    if (fileList.length > 0) {
      data.validate.file({
        fileList: fileList,
        feedback: feedback
      });
    }
  },
  paste: ({
    clipboardData = false,
    feedback = false
  }) => {
    data.validate.paste({
      clipboardData: clipboardData,
      feedback: feedback
    });
  },
  render: (dataToImport) => {
    let importString;

    if (typeof dataToImport === 'string') {
      importString = dataToImport;
    } else {
      importString = JSON.stringify(dataToImport);
    }

    let parsed;

    try {
      parsed = JSON.parse(importString);
    } catch (error) {
      console.error('Failed to parse data provided for import.', error);
      return;
    }

    const payload = resolveAppPayload(parsed);

    if (!payload) {
      console.error('Import payload is missing required application data.');
      return;
    }

    const payloadString = JSON.stringify(payload);

    let dataToCheck = JSON.parse(payloadString);

    if (dataToCheck.version !== version.number) {
      dataToCheck = data.update(dataToCheck);
    }

    const importForm = new ImportForm({
      dataToImport: dataToCheck,
      state: data.import.state
    });

    const importModal = new Modal({
      heading: message.get('dataRestoreHeading'),
      content: importForm.form(),
      successText: message.get('dataRestoreSuccessText'),
      cancelText: message.get('dataRestoreCancelText'),
      width: 'small',
      successAction: () => {
        if (data.import.state.setup.include || data.import.state.theme.include || data.import.state.bookmark.include) {
          let dataToRestore = JSON.parse(payloadString);

          if (dataToRestore.version !== version.number) {
            data.backup(dataToRestore);

            dataToRestore = data.update(dataToRestore);
          }

          data.restore(dataToRestore);

          data.save();

          data.reload.render();
        }

        data.import.reset();
      },
      cancelAction: () => { data.import.reset(); },
      closeAction: () => { data.import.reset(); }
    });

    importModal.open();
  }
};

data.validate = {
  paste: ({
    feedback = false
  } = {}) => {
    navigator.clipboard.readText().then(clipboardData => {
      // is the data a JSON object
      if (isJson(clipboardData)) {
        const parsedClipboard = JSON.parse(clipboardData);
        const payload = resolveAppPayload(parsedClipboard);

        if (payload) {
          data.feedback.clear.render(feedback);

          data.feedback.success.render(feedback, 'Clipboard data', () => {
            menu.close();

            data.import.render(payload);
          });
        } else {
          data.feedback.clear.render(feedback);

          data.feedback.fail.notClipboardJson.render(feedback, 'Clipboard data');
        }
      } else {
        // not a JSON object

        data.feedback.clear.render(feedback);

        data.feedback.fail.notClipboardJson.render(feedback, 'Clipboard data');
      }
    }).catch(() => {
      data.feedback.clear.render(feedback);

      data.feedback.fail.notClipboardJson.render(feedback, 'Clipboard data');
    });
  },
  file: ({
    fileList = false,
    feedback = false,
    input = false
  } = {}) => {
    // make new file reader
    const reader = new window.FileReader();

    // define the on load event for the reader
    reader.onload = (event) => {
      const fileContent = event.target.result;

      // is this a JSON file
      if (isJson(fileContent)) {
        const parsedFile = JSON.parse(fileContent);
        const payload = resolveAppPayload(parsedFile);

        if (payload) {
          data.feedback.clear.render(feedback);

          data.feedback.success.render(feedback, fileList[0].name, () => {
            menu.close();

            data.import.render(payload);
          });

          if (input) { input.value = ''; }
        } else {
          data.feedback.clear.render(feedback);

          data.feedback.fail.notAppJson.render(feedback, fileList[0].name);

          if (input) { input.value = ''; }
        }
      } else {
        // not a JSON file

        data.feedback.clear.render(feedback);

        data.feedback.fail.notJson.render(feedback, fileList[0].name);

        if (input) {
          input.value = '';
        }
      }
    };

    // invoke the reader
    reader.readAsText(fileList.item(0));
  }
};

data.export = () => {
  let timestamp = dateTime();

  const leadingZero = (value) => {
    if (value < 10) {
      value = '0' + value;
    }
    return value;
  };

  timestamp.hours = leadingZero(timestamp.hours);
  timestamp.minutes = leadingZero(timestamp.minutes);
  timestamp.seconds = leadingZero(timestamp.seconds);
  timestamp.date = leadingZero(timestamp.date);
  timestamp.month = leadingZero(timestamp.month + 1);
  timestamp.year = leadingZero(timestamp.year);
  timestamp = timestamp.year + '.' + timestamp.month + '.' + timestamp.date + ' - ' + timestamp.hours + ' ' + timestamp.minutes + ' ' + timestamp.seconds;

  const fileName = APP_NAME + ' ' + message.get('dataExportBackup') + ' - ' + timestamp + '.json';

  const dataToExport = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data.load()));

  const link = document.createElement('a');

  link.setAttribute('href', dataToExport);

  link.setAttribute('download', fileName);

  link.addEventListener('click', () => { link.remove(); });

  document.querySelector('body').appendChild(link);

  link.click();
};

data.remove = (key) => {
  window.localStorage.removeItem(key);
};

data.backup = (dataToBackup) => {
  if (dataToBackup) {
    data.set(APP_NAME + 'Backup', JSON.stringify(dataToBackup));

    console.log('data version ' + dataToBackup.version + ' backed up');
  }
};

data.update = (dataToUpdate) => {
  if (dataToUpdate.version !== version.number) {
    dataToUpdate = update.run(dataToUpdate);
  } else {
    console.log('data version:', version.number, 'no need to run update');
  }

  return dataToUpdate;
};

data.restore = (dataToRestore) => {
  if (dataToRestore) {
    console.log('data found to load');

    if (data.import.state.setup.include) {
      state.set.restore.setup(dataToRestore);
    }

    if (data.import.state.theme.include) {
      state.set.restore.theme(dataToRestore);
    }

    if (data.import.state.bookmark.include) {
      switch (data.import.state.bookmark.type) {
        case 'restore':
          bookmark.restore(dataToRestore);
          break;

        case 'append':
          bookmark.append(dataToRestore);
          break;
      }
    }
  } else {
    console.log('no data found to load');

    state.set.default();
  }
};

data.save = () => {
  data.set(APP_NAME, JSON.stringify({
    [APP_NAME]: true,
    version: version.number,
    state: state.get.current(),
    bookmark: bookmark.all
  }));
};

data.load = () => {
  if (data.get(APP_NAME) !== null && data.get(APP_NAME) !== undefined) {
    let dataToLoad = JSON.parse(data.get(APP_NAME));

    if (dataToLoad.version !== version.number) {
      data.backup(dataToLoad);

      dataToLoad = data.update(dataToLoad);
    }

    return dataToLoad;
  } else {
    return false;
  }
};

data.wipe = {
  all: () => {
    data.remove(APP_NAME);

    data.reload.render();
  },
  partial: () => {
    bookmark.reset();

    data.set(APP_NAME, JSON.stringify({
      [APP_NAME]: true,
      version: version.number,
      state: state.get.default(),
      bookmark: bookmark.all
    }));

    data.reload.render();
  }
};

data.reload = {
  render: () => {
    window.location.reload();
  }
};

data.clear = {
  all: {
    render: () => {
      const clearModal = new Modal({
        heading: message.get('dataClearAllHeading'),
        content: node('div', [
          node(`p:${message.get('dataClearAllContentPara1')}`),
          node(`p:${message.get('dataClearAllContentPara2')}`)
        ]),
        successText: message.get('dataClearAllSuccessText'),
        cancelText: message.get('dataClearAllCancelText'),
        width: 'small',
        successAction: () => {
          data.wipe.all();
        }
      });

      clearModal.open();
    }
  },
  partial: {
    render: () => {
      const clearModal = new Modal({
        heading: message.get('dataClearPartialHeading'),
        content: node('div', [
          node(`p:${message.get('dataClearPartialContentPara1')}`),
          node(`p:${message.get('dataClearPartialContentPara2')}`)
        ]),
        successText: message.get('dataClearPartialSuccessText'),
        cancelText: message.get('dataClearPartialCancelText'),
        width: 35,
        successAction: () => {
          data.wipe.partial();
        }
      });

      clearModal.open();
    }
  }
};

data.feedback = {};

data.feedback.empty = {
  render: (feedback) => {
    feedback.appendChild(node(`p:${message.get('dataFeedbackEmpty')}|class:muted small`));
  }
};

data.feedback.clear = {
  render: (feedback) => {
    clearChildNode(feedback);
  }
};

data.feedback.success = {
  render: (feedback, filename, action) => {
    feedback.appendChild(node(`p:${message.get('dataFeedbackSuccess')}|class:muted small`));

    feedback.appendChild(node('p:' + filename));

    if (action) {
      data.feedback.animation.set.render(feedback, 'is-pop', action);
    }
  }
};

data.feedback.fail = {
  notJson: {
    render: (feedback, filename) => {
      feedback.appendChild(node(`p:${message.get('dataFeedbackFailNotJson')}|class:small muted`));
      feedback.appendChild(complexNode({ tag: 'p', text: filename }));
      data.feedback.animation.set.render(feedback, 'is-shake');
    }
  },
  notAppJson: {
    render: (feedback, filename) => {
      feedback.appendChild(node(`p:${message.get('dataFeedbackFailNotAppJson')}|class:small muted`));
      feedback.appendChild(complexNode({ tag: 'p', text: filename }));
      data.feedback.animation.set.render(feedback, 'is-shake');
    }
  },
  notClipboardJson: {
    render: (feedback, name) => {
      feedback.appendChild(node(`p:${message.get('dataFeedbackFailNotClipboardJson')}|class:small muted`));
      feedback.appendChild(node('p:' + name));
      data.feedback.animation.set.render(feedback, 'is-shake');
    }
  }
};

data.feedback.animation = {
  set: {
    render: (feedback, animationClass, action) => {
      feedback.classList.add(animationClass);

      const animationEndAction = () => {
        if (action) {
          action();
        }
        data.feedback.animation.reset.render(feedback);
      };

      feedback.addEventListener('animationend', animationEndAction);
    }
  },
  reset: {
    render: (feedback) => {
      feedback.classList.remove('is-shake');
      feedback.classList.remove('is-pop');
      feedback.classList.remove('is-jello');
      feedback.removeEventListener('animationend', data.feedback.animation.reset.render);
    }
  }
};

data.remote = {
  config: () => {
    const remoteState = state.get.current().remote || {};
    const baseUrl = (remoteState.url || '').trim().replace(/\/+$/, '');
    const password = (remoteState.password || '').trim();

    return { baseUrl, password };
  },
  ensureConfig: () => {
    const config = data.remote.config();

    if (!config.baseUrl) {
      throw new Error('Remote sync URL is not configured.');
    }

    if (!config.password) {
      throw new Error('Remote sync password is not configured.');
    }

    return config;
  },
  healthCheck: async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Remote health check failed with status ${response.status}`);
    }

    return response;
  },
  import: async () => {
    try {
      const { baseUrl, password } = data.remote.ensureConfig();

      await data.remote.healthCheck(baseUrl);

      const response = await fetch(`${baseUrl}/api/sync/data?password=${encodeURIComponent(password)}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Remote import failed with status ${response.status}`);
      }

      const jsonData = await response.json();

      if (jsonData && jsonData.success === false) {
        const errorMessage = jsonData.message || 'Remote import reported failure.';
        throw new Error(errorMessage);
      }

      const payload = resolveAppPayload(jsonData);

      if (!payload) {
        throw new Error('Remote import payload is missing expected data.');
      }

      menu.close();
      data.import.render(payload);
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  export: async () => {
    try {
      const { baseUrl, password } = data.remote.ensureConfig();
      const currentData = data.load();

      if (!currentData) {
        throw new Error('No data found to export.');
      }

      await data.remote.healthCheck(baseUrl);

      const response = await fetch(`${baseUrl}/api/sync/data`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          password: password,
          data: currentData
        })
      });

      if (!response.ok) {
        throw new Error(`Remote export failed with status ${response.status}`);
      }

      console.log('Remote data export complete');
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
};

data.init = () => {
  data.restore(data.load());
};

export { data };
