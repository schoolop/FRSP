// server.js
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const fetch = require("node-fetch");
const path = require("path");
require("dotenv").config();

const app = express();
let sessionStatus = "DOWN"; // default

// Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecretkey",
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // CSS, JS, assets

// Passport setup
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI,
    scope: ["identify", "guilds.members.read"], // include guilds read if needed
  },
  (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
  }
));

// Authentication check middleware
function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// Helper to check if user has manager role
async function hasManagerRole(userId) {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`,
      { headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` } }
    );
    if (!response.ok) return false;
    const member = await response.json();
    return member.roles && member.roles.includes(process.env.SESSION_ROLE);
  } catch (err) {
    console.error("Error checking role:", err);
    return false;
  }
}

// Routes
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "views/index.html")));
app.get("/info", (req, res) => res.sendFile(path.join(__dirname, "views/info.html"))); // Added this route
app.get("/status", (req, res) => res.sendFile(path.join(__dirname, "views/status.html")));


// Discord OAuth login
app.get("/login", passport.authenticate("discord"));
app.get("/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => res.redirect("/manage")
);

// Manage page (staff only)
app.get("/manage", checkAuth, async (req, res) => {
  if (!(await hasManagerRole(req.user.id))) return res.send("<h1>🚫 Access Denied</h1>");
  res.sendFile(path.join(__dirname, "views/manage.html"));
});

// Change session status
app.post("/set/up", checkAuth, async (req, res) => {
  if (await hasManagerRole(req.user.id)) sessionStatus = "UP";
  res.redirect("/manage");
});
app.post("/set/down", checkAuth, async (req, res) => {
  if (await hasManagerRole(req.user.id)) sessionStatus = "DOWN";
  res.redirect("/manage");
});

// API endpoint for frontend
app.get("/api/status", (req, res) => res.json({ status: sessionStatus }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
