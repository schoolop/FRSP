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
  secret: "supersecretkey",
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public")); // for CSS

// Passport setup
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI,
    scope: ["identify"],
  },
  (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
  }
));

// Helpers
function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

async function hasManagerRole(userId) {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/members/${userId}`,
    { headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` } }
  );
  if (!response.ok) return false;
  const member = await response.json();
  return member.roles && member.roles.includes(process.env.SESSION_ROLE);
}

// Routes
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "views/index.html")));
app.get("/status", (req, res) => res.sendFile(path.join(__dirname, "views/status.html")));

app.get("/login", passport.authenticate("discord"));
app.get("/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => res.redirect("/manage")
);

// Manage (staff only)
app.get("/manage", checkAuth, async (req, res) => {
  const allowed = await hasManagerRole(req.user.id);
  if (!allowed) return res.send("<h1>🚫 Access Denied</h1>");
  res.sendFile(path.join(__dirname, "views/manage.html"));
});

// Change status
app.post("/set/up", checkAuth, async (req, res) => {
  if (await hasManagerRole(req.user.id)) sessionStatus = "UP";
  res.redirect("/manage");
});
app.post("/set/down", checkAuth, async (req, res) => {
  if (await hasManagerRole(req.user.id)) sessionStatus = "DOWN";
  res.redirect("/manage");
});

// API for frontend
app.get("/api/status", (req, res) => res.json({ status: sessionStatus }));

app.listen(3000, () => console.log("✅ Running on http://localhost:3000"));
