/**
 * Copyright (c) 2022 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import { useState, useContext, useEffect } from "react";
import { User } from "@gitpod/gitpod-protocol";
import { useHistory } from "react-router-dom";
import { UserContext } from "../user-context";
import { FeatureFlagContext } from "../contexts/FeatureFlagContext";
import { getSelectedTeamSlug, TeamsContext } from "../teams/teams-context";
import { getGitpodService } from "../service/service";
import { publicApiTeamsToProtocol, teamsService } from "../service/public-api";
import { ErrorCodes } from "@gitpod/gitpod-protocol/lib/messaging/error";
import { trackLocation } from "../Analytics";
import { refreshSearchData } from "../components/RepositoryFinder";

export const useUserAndTeamsLoader = () => {
    const [loading, setLoading] = useState<boolean>(true);
    const { user, setUser, refreshUserBillingMode } = useContext(UserContext);
    const { teams, setTeams } = useContext(TeamsContext);
    const { usePublicApiTeamsService } = useContext(FeatureFlagContext);
    const history = useHistory();
    const [isSetupRequired, setSetupRequired] = useState(false);

    useEffect(() => {
        (async () => {
            let loggedInUser: User | undefined;
            try {
                loggedInUser = await getGitpodService().server.getLoggedInUser();
                setUser(loggedInUser);

                const teams = usePublicApiTeamsService
                    ? publicApiTeamsToProtocol((await teamsService.listTeams({})).teams)
                    : await getGitpodService().server.getTeams();

                {
                    // if a team was selected previously and we call the root URL (e.g. "gitpod.io"),
                    // let's continue with the team page
                    const hash = getURLHash();
                    const isRoot = window.location.pathname === "/" && hash === "";
                    if (isRoot) {
                        try {
                            const teamSlug = getSelectedTeamSlug();
                            if (teams.some((t) => t.slug === teamSlug)) {
                                history.push(`/t/${teamSlug}`);
                            }
                        } catch {}
                    }
                }
                setTeams(teams);
            } catch (error) {
                console.error(error);
                if (error && "code" in error) {
                    if (error.code === ErrorCodes.SETUP_REQUIRED) {
                        setSetupRequired(true);
                    }
                }
            } finally {
                trackLocation(!!loggedInUser);
            }
            setLoading(false);
            (window as any)._gp.path = window.location.pathname; //store current path to have access to previous when path changes
        })();
    }, [history, setTeams, setUser, usePublicApiTeamsService]);

    // TODO: Can this check happen when we load the teams rather than a separate effect?
    useEffect(() => {
        if (!teams) {
            return;
        }
        // Refresh billing mode (side effect on other components per UserContext!)
        refreshUserBillingMode();
    }, [refreshUserBillingMode, teams]);

    // TODO: Can this check happen when we load the user rather than a separate effect?
    useEffect(() => {
        if (user) {
            refreshSearchData("", user);
        }
    }, [user]);

    return { user, teams, loading, isSetupRequired };
};

// look at moving this to a shared location
export function getURLHash() {
    return window.location.hash.replace(/^[#/]+/, "");
}