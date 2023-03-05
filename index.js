const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
// const fetch = require('node-fetch');
const WebSocket = require('ws');
// const { logIncomingToConsole } = require('./middleware/index.js');
dotenv.config();

let drivers = {};
let timers = {};
let possibleTimes = [
  12 * 60 * 1000,
  15 * 60 * 1000,
  18 * 60 * 1000,
  20 * 60 * 1000,
  24 * 60 * 1000,
];

function roll(max = 20) {
  return 1 + Math.floor(Math.random() * max);
}
const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
// app.use(logIncomingToConsole);
app.use(express.json());
const port = process.env.WS_PORT || 1339;

const server = app.listen(port, function () {
  const host = server.address().address;
  const port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});

const wss = new WebSocket.Server({ server }, 'json');

const getDriver = async function ({ driver_id, access_token }) {
  const response = await fetch(
    process.env.HOST + '/drivers/driver/' + driver_id,
    {
      headers: {
        Authorization: 'Bearer ' + access_token,
      },
    }
  );

  if (response.status === 200) {
    const driver = await response.json();

    return driver;
  }

  return { status: response.status };
};

const startTimer = (driver) => {
  timers[driver.id] = setInterval(function () {
    switch (roll(20)) {
      case 19:
        driver.msFromDestination = driver.msFromDestination + 5000;
        break;
      default:
        driver.msFromDestination = driver.msFromDestination - 5000;
        break;
    }

    if (driver.msFromDestination < 0) {
      clearInterval(timers[driver.id]);
      delete timers[driver.id];
      delete drivers[driver.id];
      driver.msFromDestination = 0;
    }
  }, 5000);
};

wss.on('connection', async (ws /*req*/) => {
  console.log('Connection received.');
  let activeDriver = null;

  if (ws.OPEN === 1) {
    ws.send(JSON.stringify(activeDriver));
  }

  let echo = setInterval(function () {
    if (ws.OPEN === 1) {
      ws.send(JSON.stringify(activeDriver));
    }
  }, 5000);

  ws.on('message', async (message) => {
    console.log('Received: %s', message);
    if (ws.OPEN === 1) {
      const data = JSON.parse(message);

      if (data.command === 'get-driver') {
        ws.send(JSON.stringify(drivers[data.driver_id]));
      } else if (data.command === 'start-driver') {
        const driver = await getDriver(data);

        /**
         * Here the driver's time from destinattion would be calculated
         * using the driver's coordinate and using the mapbox api.
         * Instead, the time is mocked and randomized.
         */
        if (driver.id) {
          if (!drivers[driver.id]) {
            driver.msFromDestination =
              possibleTimes[roll(possibleTimes.length - 1)];

            startTimer(driver);
            drivers[driver.id] = driver;
          }

          activeDriver = drivers[driver.id];

          ws.send(JSON.stringify(drivers[driver.id]));
        } else {
          ws.send(JSON.stringify(driver));
        }
      } else if (data.command === 'cancel-driver') {
        const driver = await getDriver(data.driver_id);

        if (driver) {
          delete drivers[driver.id];
        } else {
          ws.send(JSON.stringify({ message: 403 }));
        }
        ws.send(null);
      } else if (data.command === 'customer-picked-up') {
        const driver = await getDriver(data);
        if (driver.id) {
          if (!drivers[driver.id]) {
            driver.msFromDestination = data.estimated_travel_time;
            driver.pickedUp = true;
            startTimer(driver);
            drivers[driver.id] = driver;
          }

          activeDriver = drivers[driver.id];

          ws.send(JSON.stringify(drivers[driver.id]));
        } else {
          ws.send(JSON.stringify(driver));
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.log(`Server error: ${error}`);
  });

  ws.on('close', (code, reason) => {
    clearInterval(echo);
    console.log(`Closing connection: ${code} ${reason}`);
  });
});
