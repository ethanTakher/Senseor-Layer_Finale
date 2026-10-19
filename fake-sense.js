// fake-sense.js: drives the exact same window.sense object without a webcam.
// Before the live sensor starts:
//   - Move the pointer left/right to control stillness (0 -> 1).
//   - Move the pointer bottom/top to control nearness (0 -> 1).
//   - Any pointer movement marks the mock visitor as present.
//   - Number keys 1-5 force the corresponding State Table row for testing.
// When sense.js sets window.senseLive, this file stops writing.

(function () {
  const rows = window.TABLE.states;
  const signals = {};
  for (const name of window.TABLE.signals) signals[name] = 0;

  window.sense = {
    state: rows[rows.length - 1].name,
    signals,
    since: performance.now(),
  };

  function setState(name) {
    if (window.sense.state !== name) {
      window.sense.state = name;
      window.sense.since = performance.now();
    }
  }

  addEventListener('keydown', event => {
    if (window.senseLive) return;
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < rows.length) {
      // Simulate a visitor as well as forcing the chosen state.
      signals.present = 1;
      setState(rows[index].name);
    }
  });

  addEventListener('pointermove', event => {
    if (window.senseLive) return;
    signals.present = 1;
    if (innerWidth > 0) signals.still = Math.min(1, Math.max(0, event.clientX / innerWidth));
    if (innerHeight > 0) signals.near = Math.min(1, Math.max(0, 1 - event.clientY / innerHeight));
  });
})();