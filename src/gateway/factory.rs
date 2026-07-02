use crate::config::AppConfig;
use crate::gateway::traits::ChannelDriver;


pub fn load_channel_drivers(config: &AppConfig) -> Vec<Box<dyn ChannelDriver>> {
    let mut drivers: Vec<Box<dyn ChannelDriver>> = Vec::new();

    if config.mattermost.enabled {
        drivers.push(Box::new(crate::gateway::mattermost::MattermostDriver::new(
            config.mattermost.clone()
        )));
    }

    if config.matrix.enabled {
        drivers.push(Box::new(crate::gateway::matrix::MatrixDriver::new(
            config.matrix.clone()
        )));
    }

    if config.teams.enabled {
        drivers.push(Box::new(crate::gateway::teams::TeamsDriver::new(
            config.teams.clone()
        )));
    }

    // We can scale to other dynamic drivers (e.g. WhatsApp config matching) here cleanly
    drivers
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppConfig;

    #[test]
    fn test_load_channel_drivers_empty() {
        let mut config = AppConfig::default();
        config.mattermost.enabled = false;

        let drivers = load_channel_drivers(&config);
        assert!(drivers.is_empty());
    }

    #[test]
    fn test_load_channel_drivers_active() {
        let mut config = AppConfig::default();
        config.mattermost.enabled = true;

        let drivers = load_channel_drivers(&config);
        assert_eq!(drivers.len(), 1);
        assert_eq!(drivers[0].channel_id(), "mattermost");
    }

    #[test]
    fn test_load_channel_drivers_matrix_active() {
        let mut config = AppConfig::default();
        config.matrix.enabled = true;

        let drivers = load_channel_drivers(&config);
        assert_eq!(drivers.len(), 1);
        assert_eq!(drivers[0].channel_id(), "matrix");
    }

    #[test]
    fn test_load_channel_drivers_teams_active() {
        let mut config = AppConfig::default();
        config.teams.enabled = true;

        let drivers = load_channel_drivers(&config);
        assert_eq!(drivers.len(), 1);
        assert_eq!(drivers[0].channel_id(), "teams");
    }
}
