use serde::Serialize;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use sysinfo::{Disks, Networks, ProcessRefreshKind, ProcessesToUpdate, System};

#[derive(Default)]
pub struct LocalMonitor(Arc<Mutex<Option<Sampler>>>);
struct Sampler {
    system: System,
    networks: Networks,
    disks: Disks,
    last: Option<Instant>,
    disk_refresh: Instant,
    cached: Option<Snapshot>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    sampled_at: u64,
    host: String,
    os: String,
    cpu_name: String,
    cpu_percent: Option<f32>,
    cores: Vec<f32>,
    total_memory: u64,
    used_memory: u64,
    total_swap: u64,
    used_swap: u64,
    uptime: u64,
    load: [f64; 3],
    processes: Vec<ProcessSample>,
    networks: Vec<NetworkSample>,
    disks: Vec<DiskSample>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessSample {
    pid: u32,
    name: String,
    cpu: Option<f32>,
    memory: Option<u64>,
    status: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkSample {
    name: String,
    received: Option<f64>,
    transmitted: Option<f64>,
    total_received: u64,
    total_transmitted: u64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskSample {
    name: String,
    mount: String,
    total: u64,
    available: u64,
}
fn finite_cpu(value: f32) -> f32 {
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}
impl Sampler {
    fn new() -> Self {
        Self {
            system: System::new(),
            networks: Networks::new(),
            disks: Disks::new(),
            last: None,
            disk_refresh: Instant::now(),
            cached: None,
        }
    }
    fn sample(&mut self) -> Snapshot {
        let now = Instant::now();
        let elapsed = self.last.map(|last| now.duration_since(last));
        if elapsed.is_some_and(|elapsed| elapsed < Duration::from_millis(500)) {
            if let Some(cached) = &self.cached {
                return cached.clone();
            }
        }
        // Deltas after a long pause describe the pause, not current activity.
        let ready = elapsed.is_some_and(|elapsed| elapsed <= Duration::from_secs(10));
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_cpu().with_memory(),
        );
        self.networks.refresh(true);
        if self.last.is_none() || self.disk_refresh.elapsed() >= Duration::from_secs(10) {
            self.disks.refresh(true);
            self.disk_refresh = Instant::now();
        }
        let seconds = elapsed
            .map(|elapsed| elapsed.as_secs_f64())
            .unwrap_or(1.0)
            .max(0.001);
        let load = System::load_average();
        let mut processes: Vec<_> = self
            .system
            .processes()
            .values()
            .map(|process| ProcessSample {
                pid: process.pid().as_u32(),
                name: process.name().to_string_lossy().into_owned(),
                cpu: (ready && !matches!(process.status(), sysinfo::ProcessStatus::Unknown(_)))
                    .then(|| finite_cpu(process.cpu_usage())),
                memory: (process.memory() > 0
                    || !matches!(process.status(), sysinfo::ProcessStatus::Unknown(_)))
                .then(|| process.memory()),
                status: process.status().to_string(),
            })
            .collect();
        processes.sort_unstable_by_key(|process| process.pid);
        let mut networks: Vec<_> = self
            .networks
            .iter()
            .map(|(name, network)| NetworkSample {
                name: name.clone(),
                received: ready.then(|| network.received() as f64 / seconds),
                transmitted: ready.then(|| network.transmitted() as f64 / seconds),
                total_received: network.total_received(),
                total_transmitted: network.total_transmitted(),
            })
            .collect();
        networks.sort_by(|a, b| a.name.cmp(&b.name));
        let snapshot = Snapshot {
            sampled_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            host: System::host_name().unwrap_or_else(|| "This Mac".into()),
            os: System::long_os_version().unwrap_or_else(|| "Local system".into()),
            cpu_name: self
                .system
                .cpus()
                .first()
                .map(|cpu| cpu.brand().to_owned())
                .unwrap_or_default(),
            cpu_percent: ready.then(|| finite_cpu(self.system.global_cpu_usage()).min(100.0)),
            cores: if ready {
                self.system
                    .cpus()
                    .iter()
                    .map(|cpu| finite_cpu(cpu.cpu_usage()).min(100.0))
                    .collect()
            } else {
                vec![]
            },
            total_memory: self.system.total_memory(),
            used_memory: self.system.used_memory(),
            total_swap: self.system.total_swap(),
            used_swap: self.system.used_swap(),
            uptime: System::uptime(),
            load: [load.one, load.five, load.fifteen],
            processes,
            networks,
            disks: self
                .disks
                .iter()
                .filter(|disk| disk.total_space() > 0)
                .map(|disk| DiskSample {
                    name: disk.name().to_string_lossy().into_owned(),
                    mount: disk.mount_point().to_string_lossy().into_owned(),
                    total: disk.total_space(),
                    available: disk.available_space(),
                })
                .collect(),
        };
        self.last = Some(now);
        self.cached = Some(snapshot.clone());
        snapshot
    }
}
#[tauri::command]
pub async fn local_system_snapshot(
    state: tauri::State<'_, LocalMonitor>,
) -> Result<Snapshot, String> {
    // Run OS enumeration away from the UI/runtime threads. No subprocesses or SSH.
    let monitor = Arc::clone(&state.0);
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = monitor
            .lock()
            .map_err(|_| "Local monitor is unavailable.")?;
        let sampler = guard.get_or_insert_with(Sampler::new);
        Ok(sampler.sample())
    })
    .await
    .map_err(|_| "Could not sample this machine.".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn samples_local_machine_and_warms_up_deltas_without_nan() {
        let mut sampler = Sampler::new();
        let first = sampler.sample();
        assert!(first.cpu_percent.is_none());
        assert!(first
            .networks
            .iter()
            .all(|network| network.received.is_none()));
        assert!(first.total_memory > 0);
        assert!(first
            .processes
            .iter()
            .any(|process| process.pid == std::process::id()));
        assert_eq!(sampler.sample().sampled_at, first.sampled_at);
        std::thread::sleep(Duration::from_millis(600));
        let second = sampler.sample();
        assert!(second
            .cpu_percent
            .is_some_and(|cpu| (0.0..=100.0).contains(&cpu)));
        assert!(second.cores.iter().all(|cpu| cpu.is_finite()));
        assert!(second.networks.iter().all(|network| network
            .received
            .is_some_and(|value| value.is_finite() && value >= 0.0)));
        assert!(serde_json::to_string(&second).is_ok());
    }
}
