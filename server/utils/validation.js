// The one shape every route validator returns: null when the input is fine, otherwise
// { status, message } ready to send. Callers do: if (problem) return sendProblem(res, problem).
function invalid(message, status = 400) {
  return { status, message };
}

function sendProblem(res, found) {
  return res.status(found.status).json({ message: found.message });
}

module.exports = { invalid, sendProblem };
