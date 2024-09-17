async function load_prev_ids(env) {
  const prev_ids = await env.SALMON_RUN.get('prev_ids', 'json')
  if (Array.isArray(prev_ids)) {
    return new Set(prev_ids)
  } else {
    return new Set()
  }
}

async function save_ids(env, phases) {
  let ids = []
  const all_phases = phases.Normal.concat(phases.BigRun).concat(phases.TeamContest)
  for (const phase of all_phases) {
    ids.push(phase.phaseId)
  }
  await env.SALMON_RUN.put('prev_ids', JSON.stringify(ids))
}

async function fetch_phases() {
  const url = 'https://splatoon.oatmealdome.me/api/v1/three/coop/phases?count=5'
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`fetch_phases: server returns ${response.status} ${response.statusText}`)
  }
  return await response.json()
}

async function check_new_phases(sub_phases, ids, process_func) {
  for (const phase of sub_phases) {
    if (!ids.has(phase.phaseId)) {
      await process_func(phase)
    }
  }
}

async function send_message(env, message, disable_notification) {
  const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`
  const data = {
    chat_id: env.CHAT_ID,
    text: message,
    disable_notification: disable_notification,
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(`send_message: server returns ${response.status} ${response.statusText}`)
  }
}

async function process_new_phase(env, type, phase) {
  console.log(`process_new_phase ${type} ${phase.phaseId}`)
  const weapons = phase.weapons
  const disable_notification = type === 'Normal' && !weapons.includes(-2)

  const suffix = 'Check https://splatoon.oatmealdome.me/three/salmon-run';
  const message = `New ${type} phase with weapons ${weapons}\n${suffix}`

  if (type !== 'Normal' || weapons.includes(-1) || weapons.includes(-2)) {
    await send_message(env, message, disable_notification)
  }
}

export default {
  async scheduled(event, env, ctx) {
    const ids = await load_prev_ids(env)
    const phases = await fetch_phases()

    const process_normal = async (phase) => await process_new_phase(env, 'Normal', phase)
    const process_big_run = async (phase) => await process_new_phase(env, 'BigRun', phase)
    const process_team_contest = async (phase) => await process_new_phase(env, 'TeamContest', phase)

    await check_new_phases(phases.Normal, ids, process_normal)
    await check_new_phases(phases.BigRun, ids, process_big_run)
    await check_new_phases(phases.TeamContest, ids, process_team_contest)

    await save_ids(env, phases)

    console.log('cron processed')
  },
};
