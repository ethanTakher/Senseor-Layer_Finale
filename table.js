// table.js: State Table for Canopy Run.
// The first matching rule wins. Holds are measured in seconds.
// `present` is the shared presence signal from the starter; each partner owns
// one additional signal: `still` (this build) and `near` (partner-owned).

window.TABLE = {
  signals: ['present', 'still', 'near'],

  states: [
    // Movement destabilizes the drone. Keep this above the other pilot states.
    { name: 'turbulent', when: s => s.present > 0.5 && s.still < 0.34, hold: 0.35 },

    // Moving close to the camera adds throttle. At high speed the map scrolls faster.
    { name: 'boost', when: s => s.present > 0.5 && s.near > 0.72, hold: 0.45 },

    // Staying steady keeps the drone near its planned route through the clutter.
    { name: 'steady', when: s => s.present > 0.5 && s.still > 0.70, hold: 0.55 },

    { name: 'cruise', when: s => s.present > 0.5, hold: 0.30 },

    // Keep nobody last so it catches readings that do not match another state.
    { name: 'nobody', when: s => s.present < 0.20, hold: 1.0 },
  ],
};