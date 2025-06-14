const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const predictionsFile = './predictions.json';
const fixturesFile = './fixtures.json';
const resultsFile = './results.json';
const seasonFile = './seasonScores.json';

// GET /fixtures
app.get('/fixtures', (req, res) => {
  if (!fs.existsSync(fixturesFile)) {
    return res.status(404).json({ error: 'Fixtures not found' });
  }
  const fixtures = JSON.parse(fs.readFileSync(fixturesFile));
  res.json(fixtures);
});

// POST /submit
app.post('/submit', (req, res) => {
  const { name, matches } = req.body;
  if (!name || !Array.isArray(matches) || matches.length !== 5) {
    return res.status(400).json({ error: 'Invalid prediction data.' });
  }

  for (const match of matches) {
    if (
      !match.homeTeam ||
      !match.awayTeam ||
      match.homeScore == null ||
      match.awayScore == null
    ) {
      return res.status(400).json({ error: 'Incomplete match data.' });
    }
  }

  const prediction = {
    name,
    matches,
    time: new Date().toISOString()
  };

  const current = fs.existsSync(predictionsFile)
    ? JSON.parse(fs.readFileSync(predictionsFile))
    : [];

  // Prevent duplicate submissions
  if (current.some(p => p.name === name)) {
    return res.status(400).json({ error: 'You have already submitted predictions.' });
  }

  current.push(prediction);
  fs.writeFileSync(predictionsFile, JSON.stringify(current, null, 2));
  res.status(200).json({ success: true });
});

// GET /predictions
app.get('/predictions', (req, res) => {
  try {
    const data = fs.readFileSync(predictionsFile);
    res.json(JSON.parse(data));
  } catch (err) {
    res.json([]);
  }
});

// ✅ GET /submitted-names — for dropdown logic
app.get('/submitted-names', (req, res) => {
  if (!fs.existsSync(predictionsFile)) {
    return res.json([]);
  }
  const predictions = JSON.parse(fs.readFileSync(predictionsFile));
  const names = predictions.map(p => p.name);
  res.json(names);
});

// GET /leaderboard
app.get('/leaderboard', (req, res) => {
  if (!fs.existsSync(resultsFile)) {
    return res.status(400).json({ error: 'Results not set yet.' });
  }

  const results = JSON.parse(fs.readFileSync(resultsFile));
  const predictions = fs.existsSync(predictionsFile)
    ? JSON.parse(fs.readFileSync(predictionsFile))
    : [];

  const scores = {};

  predictions.forEach(pred => {
    let total = 0;

    pred.matches.forEach((match, i) => {
      const actual = results[i];
      if (!actual) return;

      const predictedOutcome =
        match.homeScore === match.awayScore ? 'draw'
        : match.homeScore > match.awayScore ? 'home' : 'away';

      const actualOutcome =
        actual.homeScore === actual.awayScore ? 'draw'
        : actual.homeScore > actual.awayScore ? 'home' : 'away';

      if (
        match.homeScore === actual.homeScore &&
        match.awayScore === actual.awayScore
      ) {
        total += 3;
      } else if (predictedOutcome === actualOutcome) {
        total += 1;
      }
    });

    if (!scores[pred.name]) {
      scores[pred.name] = 0;
    }

    scores[pred.name] += total;
  });

  const leaderboard = Object.entries(scores).map(([name, points]) => ({
    name,
    points
  })).sort((a, b) => b.points - a.points);

  res.json(leaderboard);
});

// POST /update-season
app.post('/update-season', (req, res) => {
  if (!fs.existsSync(resultsFile)) {
    return res.status(400).json({ error: 'Results not set yet.' });
  }

  const results = JSON.parse(fs.readFileSync(resultsFile));
  const predictions = fs.existsSync(predictionsFile)
    ? JSON.parse(fs.readFileSync(predictionsFile))
    : [];

  const seasonData = fs.existsSync(seasonFile)
    ? JSON.parse(fs.readFileSync(seasonFile))
    : { scores: {}, weeks: [] };

  const currentWeekKey = predictions.map(p => p.name).join('-') + results.map(r => r.homeScore + ':' + r.awayScore).join(',');
  if (seasonData.weeks.includes(currentWeekKey)) {
    return res.status(400).json({ error: 'This week has already been added to the season totals.' });
  }

  predictions.forEach(pred => {
    let total = 0;

    pred.matches.forEach((match, i) => {
      const actual = results[i];
      if (!actual) return;

      const predictedOutcome =
        match.homeScore === match.awayScore ? 'draw'
        : match.homeScore > match.awayScore ? 'home' : 'away';

      const actualOutcome =
        actual.homeScore === actual.awayScore ? 'draw'
        : actual.homeScore > actual.awayScore ? 'home' : 'away';

      if (
        match.homeScore === actual.homeScore &&
        match.awayScore === actual.awayScore
      ) {
        total += 3;
      } else if (predictedOutcome === actualOutcome) {
        total += 1;
      }
    });

    if (!seasonData.scores[pred.name]) {
      seasonData.scores[pred.name] = 0;
    }

    seasonData.scores[pred.name] += total;
  });

  seasonData.weeks.push(currentWeekKey);

  fs.writeFileSync(seasonFile, JSON.stringify(seasonData, null, 2));
  res.json({ success: true, message: 'Season scores updated once.' });
});

// GET /season
app.get('/season', (req, res) => {
  if (!fs.existsSync(seasonFile)) {
    return res.json([]);
  }

  const data = JSON.parse(fs.readFileSync(seasonFile));
  const scores = data.scores || {};
  const leaderboard = Object.entries(scores).map(([name, points]) => ({
    name,
    points
  })).sort((a, b) => b.points - a.points);

  res.json(leaderboard);

// ✅ GET /available-names — returns names that haven't submitted predictions
app.get('/available-names', (req, res) => {
  const namesFile = './names.json';

  if (!fs.existsSync(namesFile)) {
    return res.status(500).json({ error: 'names.json not found' });
  }

  const allNames = JSON.parse(fs.readFileSync(namesFile, 'utf8'));
  const predictions = fs.existsSync(predictionsFile)
    ? JSON.parse(fs.readFileSync(predictionsFile))
    : [];

  const usedNames = new Set(predictions.map(p => p.name));
  const availableNames = allNames.filter(name => !usedNames.has(name));

  res.json(availableNames);
});






});

// ✅ Start server on 0.0.0.0 to allow external access (important for NGINX or direct IP)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running and listening on http://0.0.0.0:${PORT}`);
});


