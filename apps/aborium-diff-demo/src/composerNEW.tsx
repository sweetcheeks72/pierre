import { useState, memo, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getFilenameTimestamp } from "@ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fuzzyFileSearchQuery } from "@core/conductor/FileAPI";
import { inputActions, useInputStore } from "@core/conductor/InputStore";
import { draftStoreActions } from "@core/conductor/DraftStore";
import { MentionsInput, Mention, SuggestionDataItem } from "react-mentions";
import { debounce } from "lodash";
import { useShortcut } from "@ui/hooks/useShortcut";
import { KeybindingLabel } from "@ui/components/KeybindingLabel";
// import { getFileIconData, getDirectoryIconData } from "@ui/lib/fileIcons";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@ui/components/ui/tooltip";
import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverTrigger,
} from "@ui/components/ui/popover";
import { Badge } from "@ui/components/ui/badge";
import { Avatar, AvatarImage } from "@ui/components/ui/avatar";
import {
    ArrowUp,
    ArrowUpRight,
    Paperclip,
    Check,
    ChevronsUpDown,
    Copy,
    CornerRightDown,
    RefreshCw,
    FolderSymlink,
    X,
    Bot,
    Terminal,
    Map,
    Plus,
    Handshake,
} from "lucide-react";
import { BsSticky } from "react-icons/bs";
import { Button, NotAButton } from "@ui/components/ui/button";
import { ThinkingToggle } from "@ui/components/ThinkingToggle";
import { SiClaude, SiOpenai } from "react-icons/si";
import { IoStopCircleOutline } from "react-icons/io5";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
    useCreateAttachment,
    useDeleteAttachment,
    useFinalizeAttachmentPath,
    Attachment,
    getReviewAttachmentTitle,
    attachmentQueries,
    createTextAttachment,
    createAttachment as createAttachmentDirect,
    allowedExtensions,
    MAX_ATTACHMENTS,
} from "@core/conductor/AttachmentAPI";
import {
    storeFile,
    fileTypeToAttachmentType,
    getFileFromPath,
    resizeAndStoreImage,
} from "@core/conductor/AttachmentHelpers";
import { AttachmentDropArea } from "./AttachmentViews";
import {
    useDiffComments,
    removeDiffCommentFromChat,
} from "@core/conductor/DiffCommentsAPI";
import { dispatchSyncComments } from "@ui/components/codemirror/extensions/inlineComments";
import { useWorkspaceToast } from "@ui/hooks/useWorkspaceToast";
import { useFileDrop, useFilePaste } from "@core/conductor/AttachmentAPI";
import {
    useMessageSendKey,
    useCodexProvider,
    useAlwaysShowContextWheel,
} from "@core/conductor/SettingsAPI";
import {
    useClaudeWorkspaceInit,
    claudeWorkspaceQuery,
} from "@core/conductor/ClaudeWorkspaceAPI";
import type { SlashCommand } from "@anthropic-ai/claude-agent-sdk";
import {
    BUILT_IN_SLASH_COMMANDS,
    getBuiltInCommand,
    type ConductorSlashCommand,
} from "@core/conductor/SlashCommands";
import { executeInExternalTerminal } from "@ui/lib/utils";
import { getBundledBinDir } from "@core/utils/paths";
import { AnimatedPlanBorder } from "./AnimatedPlanBorder";
import { ContextUsageHoverCard } from "./ContextUsageHoverCard";
import {
    useSession,
    useUpdateSessionModel,
    useUpdateSessionAgent,
    useUpdateSessionPermissionMode,
    useSwitchAgentWithSummary,
    type AgentType,
    type PermissionMode,
    parseAgentModel,
    ClaudeModel,
    CodexModel,
    CLAUDE_MODELS,
    MODEL_LABELS,
    CODEX_MODELS,
    getAgentFromModel,
    useClearSession,
    useCreateSession,
    suppressNextUnread,
} from "@core/conductor/SessionAPI";
import { MessageAPI } from "@core/conductor/MessageAPI";
import { SidecarAPI } from "@core/conductor/SidecarAPI";
import { useAutoConvertLongTextSetting } from "@core/conductor/SettingsAPI";
import { usePostHog } from "posthog-js/react";
import { dialogActions, useDialogStore } from "@core/conductor/DialogStore";
import {
    PICK_ISSUES_DIALOG_ID,
    PICK_LINKED_DIRECTORIES_DIALOG_ID,
    MCP_STATUS_DIALOG_ID,
} from "@core/conductor/DialogTypes";
import {
    useLinkedWorkspaces,
    useRemoveWorkspaceLink,
    type Workspace,
} from "@core/conductor/WorkspaceAPI";
import { useWorkspaceSessions } from "@core/conductor/SessionAPI";
import { useTabStore, tabActions } from "@core/stores/tabStore";
import { messageProcessingService } from "@core/services";
import { agentSidecarService } from "@core/services/agentSidecarService";
import {
    useCodexAuthResult,
    getCodexAuthInstructions,
    type CodexAuthMethod,
} from "@core/conductor/CodexAuthAPI";
import { useFocus } from "@ui/hooks/useFocus";
import { queryClientGlobal } from "@core/conductor/queryClient";
import {
    NOTES_PATH,
    isCustomPath,
    getCustomPathDisplayName,
} from "@core/lib/mentionUtils";
import { useRepo } from "@core/conductor/RepoAPI";
import { useDisplayBranch } from "@core/conductor/GitAPI";

interface ComposerProps {
    selectedSessionId: string;
    workspaceId: string;
    workspacePath: string;
    disabled?: "none" | "sendButton" | "all";
    /** Render function to display content above the composer input, receives setInputValue callback */
    renderAbove?: (setInputValue: (value: string) => void) => React.ReactNode;
}

function useCommentAttachments(
    workspaceId: string,
    sessionId: string,
): Attachment[] {
    // Subscribe to comments from database via React Query
    const { data: comments = [] } = useDiffComments(workspaceId);

    return useMemo(() => {
        // Only show ready_for_review comments as attachments
        const readyForReviewComments = comments.filter(
            (comment) => comment.state === "ready_for_review",
        );

        return readyForReviewComments.map((comment) => {
            const title = getReviewAttachmentTitle(comment);

            return {
                id: comment.id,
                type: "review",
                originalName: title,
                path: comment.filePath ?? "",
                isLoading: false,
                isDraft: true,
                sessionId,
                createdAt: new Date(comment.createdAt),
                metadata: {
                    lineNumber: (comment.lineNumber ?? 0).toString(),
                },
            };
        });
    }, [comments, sessionId]);
}

/**
 * Extract the latest plan content from the ExitPlanMode tool call in session messages.
 * Returns the plan string or undefined if no plan is found.
 */
function useLatestPlan(sessionId: string): string | undefined {
    const { data: sessionMessages } = MessageAPI.useSessionMessages(sessionId);

    return useMemo(() => {
        if (!sessionMessages?.turns) return undefined;

        // Search from the most recent turn backwards
        for (let i = sessionMessages.turns.length - 1; i >= 0; i--) {
            const turn = sessionMessages.turns[i];
            for (const message of turn.aiMessages) {
                if (message.content.type !== "assistant") continue;
                const contentMessage = message.content.message;
                if (!contentMessage?.content) continue;

                for (const block of contentMessage.content) {
                    if (
                        typeof block !== "string" &&
                        block.type === "tool_use" &&
                        block.name === "ExitPlanMode"
                    ) {
                        const toolBlock = block;
                        const input = toolBlock.input as
                            | { plan?: string }
                            | undefined;
                        if (input?.plan) {
                            return input.plan;
                        }
                    }
                }
            }
        }

        return undefined;
    }, [sessionMessages]);
}

// Allow mentions when preceded by whitespace or common punctuation like parentheses/brackets
// The capture group [^\s@]* stops at whitespace or @ to prevent long queries from pasted text
// containing @ symbols (like Kotlin annotations, email addresses, etc.)
const FILE_MENTION_TRIGGER = new RegExp("(?:^|[\\s()\\[\\]])(@([^\\s@]*))$");

function ClaudeModelButton({
    displayName,
    icon: Icon,
    isSelected,
    isNewModel,
    isDisabled,
    tooltip,
    showNewTabIcon,
    onSelect,
}: {
    displayName: string;
    icon: typeof SiClaude;
    isSelected: boolean;
    isNewModel: boolean;
    isDisabled: boolean;
    tooltip?: string;
    showNewTabIcon?: boolean;
    onSelect: () => void;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={onSelect}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                        isDisabled
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-popover-accent"
                    }`}
                    disabled={isDisabled}
                >
                    <div className="flex items-center gap-2">
                        <Icon className="size-3" />
                        <span>{displayName}</span>
                        {isNewModel && (
                            <Badge className="h-4 ml-1" variant="tip">
                                New
                            </Badge>
                        )}
                    </div>
                    {isSelected && <Check className="size-4" />}
                    {showNewTabIcon && !isSelected && (
                        <ArrowUpRight className="size-3 text-muted-foreground" />
                    )}
                </button>
            </TooltipTrigger>
            {tooltip && <TooltipContent side="right">{tooltip}</TooltipContent>}
        </Tooltip>
    );
}

function CodexModelButton({
    displayName,
    isSelected,
    isCodexSession,
    isCodexAuthenticated,
    isModelMenuBusy,
    codexProvider,
    codexAuthMethod,
    isLoadingCodexAuth,
    isNewModel,
    tooltip,
    showNewTabIcon,
    onRefetchAuth,
    onSelect,
}: {
    displayName: string;
    isSelected: boolean;
    isCodexSession: boolean;
    isCodexAuthenticated: boolean;
    isModelMenuBusy: boolean;
    codexProvider: "default" | "custom";
    codexAuthMethod: CodexAuthMethod | undefined;
    isLoadingCodexAuth: boolean;
    isNewModel?: boolean;
    tooltip?: string;
    showNewTabIcon?: boolean;
    onRefetchAuth: () => void;
    onSelect: () => void;
}) {
    // GPT-5.2-Codex requires CLI auth, not available via API key
    const isCliOnlyModel =
        displayName === "GPT-5.2-Codex" && codexProvider === "custom";
    const isDisabled =
        isModelMenuBusy || !isCodexAuthenticated || isCliOnlyModel;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={() => {
                        if (!isCodexAuthenticated || isCliOnlyModel) {
                            return;
                        }
                        onSelect();
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                        isDisabled
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-popover-accent"
                    }`}
                    disabled={isDisabled}
                >
                    <div className="flex items-center gap-2">
                        <SiOpenai className="size-3" />
                        <span>{displayName}</span>
                        {isNewModel && (
                            <Badge className="h-4 ml-1" variant="tip">
                                New
                            </Badge>
                        )}
                    </div>
                    {isCodexSession && isSelected && (
                        <Check className="size-4" />
                    )}
                    {showNewTabIcon && !(isCodexSession && isSelected) && (
                        <ArrowUpRight className="size-3 text-muted-foreground" />
                    )}
                </button>
            </TooltipTrigger>
            {!isCodexAuthenticated ? (
                <TooltipContent side="right" className="max-w-xs">
                    <div className="space-y-2">
                        <p>{getCodexAuthInstructions(codexAuthMethod)}</p>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRefetchAuth();
                            }}
                            disabled={isLoadingCodexAuth}
                            className="w-full"
                        >
                            <RefreshCw
                                className={`size-3 mr-1 ${isLoadingCodexAuth ? "animate-spin" : ""}`}
                            />
                            Refresh
                        </Button>
                    </div>
                </TooltipContent>
            ) : isCliOnlyModel ? (
                <TooltipContent side="right">
                    GPT-5.2-Codex is not available via API yet
                </TooltipContent>
            ) : tooltip ? (
                <TooltipContent side="right">{tooltip}</TooltipContent>
            ) : undefined}
        </Tooltip>
    );
}

function LinkedWorkspaceBadge({
    linkedWorkspace,
    onRemove,
}: {
    linkedWorkspace: Workspace;
    onRemove: () => void;
}) {
    const { data: repo } = useRepo(linkedWorkspace.repositoryId);
    const displayBranch = useDisplayBranch(linkedWorkspace);

    const displayName = repo?.name ?? linkedWorkspace.directoryName;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="outline"
                    className="flex items-center gap-1.5 pr-1 hover:bg-background/50"
                >
                    <FolderSymlink className="h-3 w-3" />
                    <div className="flex flex-col items-start">
                        <span className="truncate text-xs">{displayName}</span>
                        {displayBranch && (
                            <span className="text-3xs text-muted-foreground truncate">
                                {displayBranch}
                            </span>
                        )}
                    </div>
                    <NotAButton
                        variant="ghost"
                        size="iconXs"
                        className="size-4"
                        onClick={onRemove}
                    >
                        <X className="h-3 w-3" />
                    </NotAButton>
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                Files from this directory are accessible to Claude Code in this
                workspace.
            </TooltipContent>
        </Tooltip>
    );
}

export const Composer = memo(function Composer({
    selectedSessionId,
    workspaceId,
    workspacePath,
    disabled = "none",
    renderAbove,
}: ComposerProps) {
    const [inputValue, setInputValue] = useState(
        draftStoreActions.getDraft(selectedSessionId),
    );
    const { composerInputRef: inputRef, goToLastTurnRef } = useFocus();
    const { data: messageSendKey = "enter" } = useMessageSendKey();
    const posthog = usePostHog();
    const workspaceToast = useWorkspaceToast();
    const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);

    // Terminal command state (for /mcp, /agents, /hooks, etc.)
    const [terminalCommandState, setTerminalCommandState] = useState<{
        command: ConductorSlashCommand;
        stage: "pending" | "opened";
    } | null>(null);

    const { data: selectedSession, isLoading: selectedSessionLoading } =
        useSession(selectedSessionId);

    const { data: allAttachments = [] } = useQuery(
        attachmentQueries.sessionList(selectedSessionId),
    );
    const attachments = useMemo(
        () => allAttachments.filter((a) => a.isDraft),
        [allAttachments],
    );

    // Linked workspaces
    const { data: linkedWorkspaces = [] } = useLinkedWorkspaces(workspaceId);
    const removeWorkspaceLink = useRemoveWorkspaceLink();

    const { mutate: updateSessionModel, isPending: isUpdatingModel } =
        useUpdateSessionModel();
    const { mutate: updateSessionAgent, isPending: isUpdatingAgent } =
        useUpdateSessionAgent();
    const {
        mutate: updateSessionPermissionMode,
        mutateAsync: updateSessionPermissionModeAsync,
    } = useUpdateSessionPermissionMode();
    const switchAgentMutation = useSwitchAgentWithSummary();
    const clearSession = useClearSession();
    const createSession = useCreateSession();

    // Handoff state
    const [isHandingOff, setIsHandingOff] = useState(false);
    const [hasCopiedPlan, setHasCopiedPlan] = useState(false);
    const latestPlan = useLatestPlan(selectedSessionId);

    // Codex auth check
    const {
        data: codexAuth,
        isLoading: isLoadingCodexAuth,
        refetch: refetchCodexAuth,
    } = useCodexAuthResult();
    const isCodexAuthenticated = codexAuth?.isAuthenticated ?? false;
    const { data: codexProvider } = useCodexProvider();
    const { data: alwaysShowContextWheel = false } =
        useAlwaysShowContextWheel();

    // Session is locked after first message is sent
    const isSessionLocked = selectedSession?.lastUserMessageAt !== null;

    // We always initialize the session with the global default model + agent type
    // But just in case, we always fallback to Sonnet
    const selectedAgentType: AgentType = getAgentFromModel(
        selectedSession?.model,
    );
    const isCodexSession = selectedAgentType === "codex";
    const contextPercent =
        Math.round((selectedSession?.contextUsedPercent ?? 0) * 10) / 10;
    const selectedModel = parseAgentModel(selectedSession?.model);
    const isSwitchingAgent = switchAgentMutation.isPending;
    const isModelMenuBusy =
        isUpdatingModel || isUpdatingAgent || isSwitchingAgent;

    const handleSelectModel = (model: ClaudeModel | CodexModel) => {
        const targetAgentType = getAgentFromModel(model);
        const isChangingAgent = selectedAgentType !== targetAgentType;

        if (isChangingAgent && isSessionLocked) {
            // Create new session with summary and switch to target agent
            if (selectedSession) {
                switchAgentMutation.mutate(
                    { session: selectedSession, targetModel: model },
                    {
                        onError: (error) => {
                            workspaceToast.error(error.message);
                        },
                    },
                );
            }
            setIsModelPickerOpen(false);
            return;
        }

        // Update the database immediately
        if (isChangingAgent) {
            updateSessionAgent({
                sessionId: selectedSessionId,
                workspaceId,
                agentType: targetAgentType,
                model,
            });
            // Exit plan mode since Codex doesn't support it
            if (isPlanMode) {
                updateSessionPermissionMode({
                    sessionId: selectedSessionId,
                    permissionMode: "default",
                });
            }
        } else {
            updateSessionModel({
                sessionId: selectedSessionId,
                workspaceId,
                model,
            });
        }

        // Close popover and focus input
        setIsModelPickerOpen(false);
        inputRef.current?.focus();
    };

    const permissionMode = selectedSession?.permissionMode || "default";
    const isPlanMode = permissionMode === "plan";
    const canTogglePlanMode = selectedAgentType === "claude";

    // Debounced sidecar notification for permission mode changes
    const debouncedNotifySidecar = useMemo(
        () =>
            debounce((sessionId: string, mode: PermissionMode) => {
                SidecarAPI.updatePermissionMode({
                    id: sessionId,
                    agentType: "claude",
                    permissionMode: mode,
                });
            }, 300),
        [],
    );

    const handleTogglePlanMode = () => {
        if (!canTogglePlanMode) return;
        const newMode: PermissionMode = isPlanMode ? "default" : "plan";

        // Immediate DB update (UI updates instantly)
        updateSessionPermissionMode({
            sessionId: selectedSessionId,
            permissionMode: newMode,
        });

        // Debounced sidecar notification
        debouncedNotifySidecar(selectedSessionId, newMode);
    };

    const activeTabInfo = useTabStore((state) =>
        state.getActiveTab(workspaceId),
    );
    const isViewingDiffOrFile = activeTabInfo?.type === "file";

    // Get all sessions for this workspace (for session picker if in diff or file view)
    const { data: workspaceSessions = [] } = useWorkspaceSessions(workspaceId);
    // The target session for sending messages (when viewing diffs/files, user can pick)
    const [targetSessionId, setTargetSessionId] = useState(selectedSessionId);
    // Keep targetSessionId in sync with sessionId when sessionId changes
    useEffect(() => {
        setTargetSessionId(selectedSessionId);
    }, [selectedSessionId]);

    const { data: claudeWorkspaceData } = useClaudeWorkspaceInit(
        workspaceId,
        workspacePath,
    );
    const slashCommands = useMemo(() => {
        const workspaceCommands = claudeWorkspaceData?.slashCommands ?? [];
        const existingNames = new Set(
            workspaceCommands.map((command) => command.name),
        );
        const builtinCommands = BUILT_IN_SLASH_COMMANDS.filter(
            (command) => !existingNames.has(command.name),
        );
        return [...workspaceCommands, ...builtinCommands];
    }, [claudeWorkspaceData?.slashCommands]);

    const agents = useMemo(
        () => claudeWorkspaceData?.agents ?? [],
        [claudeWorkspaceData?.agents],
    );

    // Attachment hooks
    const createAttachment = useCreateAttachment();
    const deleteAttachment = useDeleteAttachment();
    const finalizeAttachmentPath = useFinalizeAttachmentPath();
    const filePaste = useFilePaste({
        sessionId: selectedSessionId,
        workspaceId,
        agentType: selectedAgentType,
    });
    const { mutateAsync: fileDropMutateAsync } = useFileDrop({
        sessionId: selectedSessionId,
        workspaceId,
        agentType: selectedAgentType,
    });

    // Paste settings
    const { data: autoConvertLongText = true } =
        useAutoConvertLongTextSetting();

    // Comment attachments for preview in composer
    const commentAttachments = useCommentAttachments(
        workspaceId,
        selectedSessionId,
    );

    const isWorking = selectedSession?.status === "working";
    const needsPlanResponse = selectedSession?.status === "needs_plan_response";

    const getPlaceholder = () => {
        if (isWorking) {
            return "Add a follow up";
        }
        if (disabled === "all") {
            return "Chat disabled";
        } else if (needsPlanResponse) {
            return "Enter your plan adjustments here...";
        } else {
            return "Ask to make changes, @mention files, run /commands";
        }
    };

    // Save draft whenever input changes
    useEffect(() => {
        if (inputValue.trim()) {
            draftStoreActions.setDraft(selectedSessionId, inputValue);
        } else {
            draftStoreActions.clearDraft(selectedSessionId);
        }
    }, [inputValue, selectedSessionId]);

    // Load draft when sessionId changes
    useEffect(() => {
        const newDraft = draftStoreActions.getDraft(selectedSessionId);
        setInputValue(newDraft);

        // Focus composer when session changes - use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                // Set cursor to the end of the draft
                if (newDraft) {
                    inputRef.current.setSelectionRange(
                        newDraft.length,
                        newDraft.length,
                    );
                }
            }
        });
    }, [selectedSessionId, inputRef]);

    // Focus management
    const focusedChatInputId = useInputStore((state) => state.focusedInputId);
    const COMPOSER_INPUT_ID = "composer-input";
    const isNextFocus = useMemo(() => {
        return focusedChatInputId !== COMPOSER_INPUT_ID;
    }, [focusedChatInputId]);

    // Focus chat input
    useShortcut("chat.focus", () => {
        // Don't focus composer if a terminal has selected text (let terminal handle it)
        if (isNextFocus) {
            inputRef.current?.focus();
        }
    });

    // Toggle plan mode
    useShortcut("chat.togglePlanMode", () => {
        handleTogglePlanMode();
    });

    // Approve plan when needsPlanResponse is active and still in plan mode
    // Disabled when user manually exits plan mode with shift+tab
    useShortcut("chat.approvePlan", () => {
        if (needsPlanResponse && isPlanMode) {
            void handleApprovePlan();
        }
    });

    // Cancel execution
    useShortcut("chat.cancel", () => {
        if (isWorking) {
            void messageProcessingService.cancelSession(selectedSession.id);

            posthog?.capture("cancel_attempt", {
                session_id: selectedSession.id,
                method: "keyboard_shortcut",
            });

            // Keep input focused so user can immediately follow up
            inputRef.current?.focus();
        }
    });

    // Cycle through models (Claude only for now)
    useShortcut("chat.cycleModel", () => {
        if (selectedAgentType !== "claude") return;

        const currentIndex = CLAUDE_MODELS.indexOf(
            selectedModel as ClaudeModel,
        );
        const nextIndex = (currentIndex + 1) % CLAUDE_MODELS.length;
        const nextModel = CLAUDE_MODELS[nextIndex];

        updateSessionModel({
            sessionId: selectedSessionId,
            workspaceId,
            model: nextModel,
        });
    });

    // Auto-focus when InputStore signals this composer should focus
    useEffect(() => {
        if (focusedChatInputId === COMPOSER_INPUT_ID && inputRef.current) {
            // Use requestAnimationFrame to ensure DOM is ready
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                // Move cursor to end
                const len = inputRef.current?.value.length || 0;
                inputRef.current?.setSelectionRange(len, len);
            });
        }
    }, [focusedChatInputId, COMPOSER_INPUT_ID, inputRef]);

    const cachedSuggestions = useRef<SuggestionDataItem[]>([]);

    // Determine if message can be sent (has text or attachments)
    const canSendMessage = useMemo(() => {
        const hasText = inputValue.trim().length > 0;
        const hasAttachments = attachments.length > 0;
        const hasComments = commentAttachments.length > 0;
        return (
            (hasText || hasAttachments || hasComments) && disabled === "none"
        );
    }, [inputValue, attachments.length, disabled, commentAttachments.length]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled === "all") return;

        // Handle up arrow at position 0 (Slack-style behavior): navigate to previous message
        if (e.key === "ArrowUp" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            const textarea = inputRef.current;
            if (textarea) {
                const cursorPos = textarea.selectionStart ?? 0;
                if (cursorPos === 0) {
                    e.preventDefault();
                    textarea.blur();
                    goToLastTurnRef.current?.();
                    return;
                }
            }
        }

        // If plan needs response and user pressed Cmd+Shift+Enter, don't send message
        if (
            needsPlanResponse &&
            e.key === "Enter" &&
            (e.metaKey || e.ctrlKey) &&
            e.shiftKey
        ) {
            return;
        }

        // Don't send if user is composing with an IME (e.g. typing Chinese/Japanese/Korean)
        if (e.nativeEvent.isComposing) return;

        const shouldSend =
            messageSendKey === "enter"
                ? e.key === "Enter" && !e.shiftKey
                : e.key === "Enter" && (e.metaKey || e.ctrlKey);

        if (shouldSend) {
            e.preventDefault();
            void handleSubmit(e);
        }
    };

    // Parse message and return a built-in command if present
    function extractBuiltInCommand(
        message: string,
    ): ConductorSlashCommand | null {
        let commandName: string | null = null;
        // Autocomplete format: /[command](command)
        if (message.startsWith("/[")) {
            const endBracket = message.indexOf("]");
            if (endBracket > 2) {
                commandName = message.slice(2, endBracket);
            }
        }
        // Direct format: /command or /command args
        else if (message.startsWith("/")) {
            const spaceIndex = message.indexOf(" ");
            commandName =
                spaceIndex > 0
                    ? message.slice(1, spaceIndex)
                    : message.slice(1);
        }
        return commandName ? getBuiltInCommand(commandName) : null;
    }

    // Handle built-in commands that don't go to the agent
    // Returns true if command was handled, false to fall through to regular flow
    const handleBuiltInCommand = (command: ConductorSlashCommand): boolean => {
        if (command.name === "add-dir") {
            dialogActions.openDialog(PICK_LINKED_DIRECTORIES_DIALOG_ID);
            return true;
        } else if (command.name === "mcp-status") {
            dialogActions.openDialog(MCP_STATUS_DIALOG_ID);
            return true;
        } else if (command.name === "clear") {
            if (!selectedSession) return true;

            clearSession.mutate({
                sessionId: selectedSession.id,
                workspaceId,
                model: selectedSession.model ?? undefined,
                thinkingEnabled: selectedSession.thinkingEnabled,
            });
            return true;
        } else if (command.name === "restart") {
            if (!selectedSession) return true;

            // Reset the generator so next message creates fresh one with updated config
            SidecarAPI.resetGenerator({
                id: selectedSession.id,
                agentType: "claude",
            });

            // Invalidate the workspace query to refresh slash commands, agents, etc.
            queryClientGlobal
                .invalidateQueries(
                    claudeWorkspaceQuery(workspaceId, workspacePath),
                )
                .then(() => {
                    workspaceToast.success("Restarted Claude Code");
                })
                .catch((error: unknown) => {
                    console.error("Failed to refresh workspace config:", error);
                    workspaceToast.error("Failed to restart Claude Code");
                });

            return true;
        } else if (command.opensInTerminal) {
            setTerminalCommandState({ command, stage: "pending" });
            return true;
        }
        return false;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSendMessage) return;

        const message = inputValue.trim();
        // Clear input
        setInputValue("");
        draftStoreActions.clearDraft(selectedSessionId);

        // 1. Handle built-in commands (returns true if handled + early exit)
        if (selectedAgentType === "claude") {
            const builtInCommand = extractBuiltInCommand(message);
            if (builtInCommand) {
                return handleBuiltInCommand(builtInCommand);
            }
        }

        // 2. Regular message flow
        if (targetSessionId) {
            // If there's an outstanding plan response, deny it first
            if (needsPlanResponse && selectedSession) {
                await agentSidecarService.resolveExitPlanMode(
                    selectedSession.id,
                    false,
                );
            }

            const targetSession = workspaceSessions.find(
                (s) => s.id === targetSessionId,
            );

            if (!targetSession) {
                workspaceToast.error("Session not found");
                return;
            }

            if (isViewingDiffOrFile) {
                tabActions.setActiveTab(
                    workspaceId,
                    targetSessionId,
                    "session",
                );
            }

            await messageProcessingService.enqueueMessage(
                targetSession,
                message,
                workspaceId,
                true,
            );
        }
    };

    // Open external terminal with claude command
    const handleOpenTerminal = async () => {
        if (!terminalCommandState) return;
        const binDir = await getBundledBinDir();
        const claudePath = `\\"${binDir}/claude\\"`;
        executeInExternalTerminal(
            `${claudePath} /${terminalCommandState.command.name}`,
            workspacePath,
        );
        setTerminalCommandState({ ...terminalCommandState, stage: "opened" });
    };

    // Refresh config after terminal changes
    const handleRefreshConfig = async () => {
        if (!terminalCommandState || !selectedSessionId) return;

        // Reset the generator so next message gets fresh config
        SidecarAPI.resetGenerator({
            id: selectedSessionId,
            agentType: "claude",
        });

        // Invalidate the query to trigger a refetch
        await queryClientGlobal.invalidateQueries(
            claudeWorkspaceQuery(workspaceId, workspacePath),
        );

        workspaceToast.success("Configuration refreshed.");
        setTerminalCommandState(null);
    };

    const handleAttachmentPicker = async () => {
        if (disabled === "all") return;

        if (attachments.length >= MAX_ATTACHMENTS) {
            workspaceToast.error(
                `Maximum ${MAX_ATTACHMENTS} attachments allowed`,
            );
            return;
        }

        const selected = await open({
            multiple: true,
            filters: [
                {
                    name: "Images, PDFs, and text",
                    extensions: Object.values(allowedExtensions).flat(),
                },
            ],
        });

        if (selected && selected.length > 0) {
            for (const filePath of selected) {
                if (typeof filePath === "string") {
                    const fileType = fileTypeToAttachmentType(filePath);
                    if (!fileType) continue;

                    // Extract filename from path
                    const filename = filePath.includes("/")
                        ? filePath.slice(filePath.lastIndexOf("/") + 1)
                        : filePath;

                    // Create attachment record
                    const attachmentId = await createAttachment.mutateAsync({
                        type: fileType,
                        originalName: filename,
                        path: filename, // placeholder
                        isLoading: true,
                        isDraft: true,
                        sessionId: selectedSessionId,
                    });

                    // Store the file data
                    // For Claude images > 4.5MB, resize to fit under the limit
                    let storedPath: string;
                    if (
                        fileType === "image" &&
                        selectedAgentType === "claude"
                    ) {
                        const file = await getFileFromPath(filePath);
                        storedPath = await resizeAndStoreImage(
                            workspaceId,
                            file,
                        );
                    } else {
                        storedPath = await storeFile(workspaceId, filePath);
                    }

                    // Finalize the attachment path
                    await finalizeAttachmentPath.mutateAsync({
                        attachmentId,
                        storedPath,
                        sessionId: selectedSessionId,
                    });
                }
            }

            // Focus the composer after adding attachments
            inputRef.current?.focus();
        }
    };

    // Query function for file mentions (non-debounced inner function)
    const queryFilesInner = useCallback(
        async (
            query: string,
            callback: (data: SuggestionDataItem[]) => void,
        ) => {
            // Search files using nucleo (Rust backend) via React Query
            // Files are cached in Rust - no need to pass them from frontend
            const fileResults = await queryClientGlobal.fetchQuery(
                fuzzyFileSearchQuery(workspacePath, query),
            );

            // Convert file results to mention data format
            // Filter out notes file since we have a dedicated notes suggestion
            const fileItems = fileResults
                .filter((result) => !isCustomPath(result.relative_path))
                .map((result) => ({
                    id: encodeURIComponent(result.file.path),
                    display: result.relative_path,
                    fileName:
                        result.relative_path.split("/").pop() ||
                        result.relative_path,
                    fullPath: result.relative_path,
                    type: "file" as const,
                    isDirectory: result.file.is_directory,
                }));

            // Filter agents with simple case-insensitive substring matching
            const lowerQuery = query.toLowerCase();
            const matchingAgents = agents
                .filter(
                    (agentName) =>
                        !query || agentName.toLowerCase().includes(lowerQuery),
                )
                .map((agentName) => ({
                    id: `agent:${agentName}`,
                    display: agentName,
                    type: "agent" as const,
                }));

            // Add notes suggestion if query matches "notes" (case-insensitive)
            const notesItem =
                !query || "notes".includes(lowerQuery)
                    ? [
                          {
                              id: NOTES_PATH,
                              display: NOTES_PATH,
                              type: "notes" as const,
                          },
                      ]
                    : [];

            // Combine: notes first, then agents, then files
            const results = [...notesItem, ...matchingAgents, ...fileItems];

            cachedSuggestions.current = results;
            callback(results);
        },
        [workspacePath, agents],
    );

    // Debounced query function (wraps async queryFilesInner)
    const debouncedQueryFiles = useMemo(
        () =>
            debounce(
                (
                    query: string,
                    callback: (data: SuggestionDataItem[]) => void,
                ) => {
                    void queryFilesInner(query, callback);
                },
                150,
            ),
        [queryFilesInner],
    );

    // Clean up debounced function on unmount
    useEffect(() => {
        return () => {
            debouncedQueryFiles.cancel();
        };
    }, [debouncedQueryFiles]);

    // Wrapper that returns cached results immediately, then updates with debounced results
    const queryFiles = useCallback(
        (query: string, callback: (data: SuggestionDataItem[]) => void) => {
            // If starting fresh (empty query), trigger a search for all files
            if (!query.trim()) {
                void queryFilesInner("", callback);
                return;
            }

            // For non-empty queries, immediately return cached results to prevent flickering
            callback(cachedSuggestions.current);

            // Then perform the debounced async search
            debouncedQueryFiles(query, callback);
        },
        [debouncedQueryFiles, queryFilesInner],
    );

    // Custom render function for file and agent suggestions
    const renderSuggestion = (
        suggestion: SuggestionDataItem & {
            isDirectory?: boolean;
            type?: "file" | "agent" | "notes";
        },
        _search: string,
        _highlightedDisplay: React.ReactNode,
        _index: number,
        focused: boolean,
    ) => {
        // Handle notes mention
        if (suggestion.type === "notes") {
            return (
                <div
                    className={`flex items-center justify-between px-1 py-1 ${focused ? "bg-sidebar-accent" : ""}`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <BsSticky
                            size={12}
                            className="flex-shrink-0 text-muted-foreground"
                        />
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs">notes</span>
                            <span className="text-3xs text-muted-foreground">
                                Your workspace scratchpad
                            </span>
                        </div>
                    </div>
                </div>
            );
        }

        // Handle agent mentions
        if (suggestion.type === "agent") {
            return (
                <div
                    className={`flex items-center justify-between px-1 py-1 ${focused ? "bg-sidebar-accent" : ""}`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Bot
                            size={12}
                            className="flex-shrink-0 text-muted-foreground"
                        />
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium">
                                {suggestion.display}
                            </span>
                            <span className="text-3xs text-muted-foreground">
                                Agent
                            </span>
                        </div>
                    </div>
                </div>
            );
        }

        // Handle file mentions
        // Extract just the filename/folder name from the path
        const fullPath = suggestion.display as string;
        const pathParts = fullPath.split("/");
        const fileName = pathParts.pop() || fullPath;
        const directoryPath = pathParts.join("/");

        // Get the appropriate icon and color based on whether it's a directory
        const iconData = suggestion.isDirectory
            ? getDirectoryIconData()
            : getFileIconData(fileName);
        const Icon = iconData.icon;

        return (
            <div
                className={`flex items-center justify-between px-1 py-1 ${focused ? "bg-sidebar-accent" : ""}`}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <span className={`flex-shrink-0 ${iconData.color}`}>
                        <Icon size={12} />
                    </span>
                    <div className="flex gap-1 items-center">
                        <span className="text-[12px]">{fileName}</span>
                        {directoryPath && (
                            <span className="text-3xs text-muted-foreground truncate">
                                {directoryPath}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Prepare slash command data for Fuse search, deduping by exact ID match
    const slashCommandData = useMemo(() => {
        const seenIds = new Set<string>();
        return slashCommands
            .map((cmd) => ({
                id: cmd.name,
                display: cmd.name,
                command: cmd,
            }))
            .filter((item) => {
                if (seenIds.has(item.id)) {
                    return false;
                }
                seenIds.add(item.id);
                return true;
            });
    }, [slashCommands]);

    // Query function for slash commands
    const querySlashCommands = useCallback(
        (query: string, callback: (data: SuggestionDataItem[]) => void) => {
            // Slash commands are only available for Claude sessions
            if (isCodexSession) {
                callback([]);
                return;
            }

            if (slashCommandData.length === 0) {
                callback([]);
                return;
            }

            // Show all commands if query is empty
            if (!query) {
                callback(slashCommandData);
                return;
            }

            // Simple case-insensitive substring filter
            const lowerQuery = query.toLowerCase();
            const filtered = slashCommandData.filter((item) =>
                item.command.name.toLowerCase().includes(lowerQuery),
            );

            callback(filtered);
        },
        [slashCommandData, isCodexSession],
    );

    // Render function for slash command suggestions
    const renderSlashCommand = (
        suggestion: SuggestionDataItem & {
            command?: SlashCommand;
        },
        _search: string,
        _highlightedDisplay: React.ReactNode,
        _index: number,
        focused: boolean,
    ) => {
        const command = suggestion.command;
        if (!command) return null;

        return (
            <div
                className={`flex items-center gap-2 px-2 py-1.5 ${focused ? "bg-sidebar-accent" : ""}`}
            >
                <span className="text-muted-foreground text-sm">/</span>
                <div className="font-medium text-xs">{command.name}</div>
                <div className="text-3xs text-muted-foreground truncate min-w-0 mt-0.5">
                    {command.description}
                </div>
            </div>
        );
    };

    // Styles for the mentions input
    const mentionStyle = {
        input: {
            outline: "none",
        },
        // styling for the suggestions list container
        // this could all be set as standard tailwind classNames on a div
        // set via the customSuggestionsContainer prop in the MentionsInput component
        // but scrolling seems to break with keyboard navigation that way :( - Omid
        suggestions: {
            list: {
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                maxHeight: "308px",
                overflowY: "auto" as const,
                overflowX: "hidden" as const,
                position: "absolute" as const,
                bottom: "calc(100% + 1rem)",
                left: 0,
                right: 0,
                width: "100%",
                minWidth: "500px",
                maxWidth: "500px",
                boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                whiteSpace: "nowrap",
                zIndex: 9999,
            },
        },
        // This is where most of the top-level styles are defined for the mentions input
        // Remove overflow from control to let the container handle scrolling
        control: {
            backgroundColor: "transparent",
            fontSize: "inherit",
            fontWeight: 350,
            border: "none",
            minHeight: "3rem",
            textOverflow: "ellipsis",
            padding: 0,
        },
        highlighter: {
            border: "none",
            padding: 0,
        },
    };

    function getTooltipContent() {
        if (isWorking) {
            return (
                <span className="inline-flex items-center gap-1">
                    Cancel <KeybindingLabel commandId="chat.cancel" />
                </span>
            );
        }
        return messageSendKey === "enter"
            ? "Send message ↵"
            : "Send message ⌘↵";
    }

    function getSendButtonClassName() {
        if (isWorking) {
            return "border border-border hover:bg-muted";
        }
        if (!canSendMessage) {
            return "bg-foreground/50 cursor-not-allowed";
        }
        if (isPlanMode) {
            return "bg-plan-border hover:bg-plan-border/80";
        }
        return "bg-foreground hover:bg-foreground/80";
    }

    const handleRemoveAttachment = async (id: string) => {
        try {
            if (commentAttachments.some((attachment) => attachment.id === id)) {
                await removeDiffCommentFromChat(workspaceId, id);
                dispatchSyncComments(workspaceId);
            } else {
                await deleteAttachment.mutateAsync(id);
            }
        } catch (_error) {
            workspaceToast.error("Failed to remove attachment");
        }
    };

    const handleFileDrop = useCallback(
        async (paths: string[]) => {
            // Separate directories from files
            const directories: string[] = [];
            const files: string[] = [];

            await Promise.all(
                paths.map(async (path) => {
                    try {
                        const metadata = await invoke<{
                            size: number;
                            isFile: boolean;
                            isDirectory: boolean;
                        }>("get_file_metadata", { path });

                        if (metadata.isDirectory) {
                            directories.push(path);
                        } else if (metadata.isFile) {
                            files.push(path);
                        }
                    } catch (error) {
                        console.error("Failed to get file metadata:", error);
                        // Assume it's a file if we can't determine
                        files.push(path);
                    }
                }),
            );

            // Handle directories by inserting them as @ mentions
            if (directories.length > 0) {
                const mentions = directories.map((dirPath) => {
                    // Compute relative path from workspace path
                    let relativePath = dirPath;
                    if (dirPath.startsWith(workspacePath)) {
                        relativePath = dirPath.slice(workspacePath.length);
                        // Remove leading slash if present
                        if (relativePath.startsWith("/")) {
                            relativePath = relativePath.slice(1);
                        }
                    }
                    // Format as mention: @⟦display⟧(id)
                    const encodedPath = encodeURIComponent(dirPath);
                    return `@⟦${relativePath}⟧(${encodedPath})`;
                });

                // Insert mentions into input (with space after each)
                const mentionText = mentions.join(" ") + " ";
                setInputValue((prev) => {
                    // If input is empty or ends with whitespace, just append
                    if (!prev.trim() || /\s$/.test(prev)) {
                        return prev + mentionText;
                    }
                    // Otherwise add a space before the mentions
                    return prev + " " + mentionText;
                });

                // Focus the input after inserting mentions
                inputRef.current?.focus();
            }

            // Handle files as attachments (if any)
            if (files.length > 0) {
                if (attachments.length >= MAX_ATTACHMENTS) {
                    workspaceToast.error(
                        `Maximum ${MAX_ATTACHMENTS} attachments allowed`,
                    );
                    return;
                }
                await fileDropMutateAsync(files);
            }
        },
        [
            attachments.length,
            fileDropMutateAsync,
            workspacePath,
            inputRef,
            workspaceToast,
        ],
    );

    // Paste handler
    const handlePaste = async (e: React.ClipboardEvent<HTMLFormElement>) => {
        const items = Array.from(e.clipboardData.items);
        const text = e.clipboardData.getData("text/plain");

        // Handle image paste
        const imageItems = items.filter((item) =>
            item.type.startsWith("image/"),
        );
        if (imageItems.length > 0) {
            e.preventDefault();
            const files = imageItems
                .map((item) => item.getAsFile())
                .filter((file): file is File => file !== null);
            if (files.length > 0) {
                if (attachments.length >= MAX_ATTACHMENTS) {
                    workspaceToast.error(
                        `Maximum ${MAX_ATTACHMENTS} attachments allowed`,
                    );
                    return;
                }
                await filePaste.mutateAsync(files);
            }
            return;
        }

        // Handle long text conversion
        if (
            autoConvertLongText &&
            text &&
            (text.split("\n").length > 90 || text.length > 5000)
        ) {
            e.preventDefault(); // Prevent the text from being inserted
            e.stopPropagation(); // Stop event propagation

            if (attachments.length >= MAX_ATTACHMENTS) {
                workspaceToast.error(
                    `Maximum ${MAX_ATTACHMENTS} attachments allowed`,
                );
                return;
            }
            const textFile = new File(
                [text],
                `pasted_text_${getFilenameTimestamp()}.txt`,
                {
                    type: "text/plain",
                },
            );
            await filePaste.mutateAsync([textFile]);
            return;
        }
    };

    const isIssuesDialogOpen = useDialogStore(
        (state) => state.activeDialogId === PICK_ISSUES_DIALOG_ID,
    );

    useShortcut("chat.linkLinear", () => {
        if (isIssuesDialogOpen) {
            dialogActions.closeDialog(PICK_ISSUES_DIALOG_ID);
        } else {
            dialogActions.openDialog(PICK_ISSUES_DIALOG_ID);
        }
    });

    useShortcut("chat.addAttachment", () => {
        void handleAttachmentPicker();
    });

    function findSessionDisplayName(sessionId: string) {
        if (workspaceSessions.length === 0) return "";

        const session = workspaceSessions.find((s) => s.id === sessionId);
        return session ? session.title : "";
    }

    const showSessionPicker = useMemo(
        () => isViewingDiffOrFile && workspaceSessions.length > 1,
        [isViewingDiffOrFile, workspaceSessions.length],
    );

    const showEyebrow =
        showSessionPicker ||
        (needsPlanResponse && isPlanMode) ||
        terminalCommandState !== null;

    const handleApprovePlanWithFeedback = async (feedback: string) => {
        if (!selectedSession) return;

        // 1. Deny to unsuspend CC (it's waiting on ExitPlanMode approval)
        await agentSidecarService.resolveExitPlanMode(
            selectedSession.id,
            false,
        );

        // 2. Update permission mode to default in DB
        await updateSessionPermissionModeAsync({
            sessionId: selectedSession.id,
            permissionMode: "default",
        });

        // 3. Send the feedback as a user message
        setInputValue("");
        draftStoreActions.clearDraft(selectedSessionId);

        await messageProcessingService.enqueueMessage(
            selectedSession,
            feedback,
            workspaceId,
            true,
        );
    };

    const handleApprovePlan = async () => {
        if (!selectedSession) return;

        const feedback = inputValue.trim();

        if (feedback) {
            // User has feedback - use the "approve with feedback" flow
            await handleApprovePlanWithFeedback(feedback);
            return;
        }

        // No feedback - normal approval flow
        await agentSidecarService.resolveExitPlanMode(selectedSession.id, true);
    };

    const handleHandoffPlan = async () => {
        if (!selectedSession || !latestPlan) return;

        const originalSessionId = selectedSession.id;

        setIsHandingOff(true);
        try {
            // 1. Create the text attachment stub
            const attachmentStub = await createTextAttachment(
                workspaceId,
                "plan.md",
                latestPlan,
            );

            // 2. Create a new session
            const newSession = await createSession.mutateAsync({
                workspaceId,
                // Override `default to plan mode` toggle if enabled
                permissionMode: "default",
            });

            // 3. Create the attachment associated with the new session
            await createAttachmentDirect({
                ...attachmentStub,
                sessionId: newSession.id,
            });

            // 4. Set the new session as active (navigate first to avoid scrolling issues)
            tabActions.setActiveTab(workspaceId, newSession.id, "session");

            // 5. Suppress the next unread flag for the original session
            // (the denial response would otherwise mark it as unread)
            suppressNextUnread(originalSessionId);

            // 6. Deny to unsuspend CC (it's waiting on ExitPlanMode approval)
            await agentSidecarService.resolveExitPlanMode(
                originalSessionId,
                false,
            );

            // 7. Update permission mode to default in DB (takes current session out of plan mode)
            await updateSessionPermissionModeAsync({
                sessionId: originalSessionId,
                permissionMode: "default",
            });
        } catch (error) {
            console.error("Failed to handoff plan:", error);
            workspaceToast.error({
                message: "Failed to handoff plan",
                description:
                    error instanceof Error ? error.message : "Unknown error",
            });
        } finally {
            setIsHandingOff(false);
        }
    };

    if (selectedSessionLoading) {
        return null;
    }

    return (
        <div className="relative max-w-6xl mx-auto @container">
            {/* Optional content above composer (e.g., onboarding suggestions) */}
            {renderAbove?.(setInputValue)}

            {/* Combined eyebrow for session picker and plan response */}
            {showEyebrow && (
                <div
                    className={`flex items-center justify-between gap-2 px-4 py-2 bg-background rounded-t-lg ${!isPlanMode ? "!border !border-input-border" : ""}`}
                >
                    {/* Left side: Session picker if needed */}
                    {showSessionPicker && (
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                                Sending to:
                            </span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 px-1.5 text-xs font-normal hover:bg-muted max-w-[200px]"
                                    >
                                        <span className="truncate">
                                            {findSessionDisplayName(
                                                targetSessionId,
                                            )}
                                        </span>
                                        <ChevronsUpDown className="size-3 text-muted-foreground flex-shrink-0 ml-1" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-52 p-1 rounded-lg"
                                    align="start"
                                    side="bottom"
                                >
                                    <div>
                                        {workspaceSessions.map((session) => {
                                            return (
                                                <button
                                                    key={session.id}
                                                    onClick={() =>
                                                        setTargetSessionId(
                                                            session.id,
                                                        )
                                                    }
                                                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-popover-accent cursor-default"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {getAgentFromModel(
                                                            session.model,
                                                        ) === "codex" ? (
                                                            <SiOpenai className="size-3 flex-shrink-0" />
                                                        ) : (
                                                            <SiClaude className="size-3 flex-shrink-0" />
                                                        )}
                                                        <span className="truncate">
                                                            {session.title}
                                                        </span>
                                                    </div>
                                                    {targetSessionId ===
                                                        session.id && (
                                                        <Check className="size-4 flex-shrink-0" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}

                    {/* Right side: Plan response controls if needed */}
                    {needsPlanResponse && isPlanMode && !showSessionPicker && (
                        <>
                            <span className="text-xs text-muted-foreground">
                                Approve the plan (
                                <KeybindingLabel commandId="chat.approvePlan" />{" "}
                                ) or tell the AI what to do differently{" "}
                                <CornerRightDown className="size-3 inline align-text-bottom" />
                            </span>
                            <div className="flex items-center gap-2 ml-auto">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-3 text-xs"
                                            onClick={() => {
                                                if (latestPlan) {
                                                    navigator.clipboard
                                                        .writeText(latestPlan)
                                                        .then(() => {
                                                            setHasCopiedPlan(
                                                                true,
                                                            );
                                                            window.setTimeout(
                                                                () =>
                                                                    setHasCopiedPlan(
                                                                        false,
                                                                    ),
                                                                2000,
                                                            );
                                                        })
                                                        .catch(() => {
                                                            workspaceToast.error(
                                                                "Failed to copy plan",
                                                            );
                                                        });
                                                }
                                            }}
                                            disabled={!latestPlan}
                                            type="button"
                                        >
                                            {hasCopiedPlan ? (
                                                <Check className="size-3 mr-1" />
                                            ) : (
                                                <Copy className="size-3 mr-1" />
                                            )}
                                            {hasCopiedPlan ? "Copied" : "Copy"}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>
                                            {hasCopiedPlan
                                                ? "Copied to clipboard"
                                                : "Copy plan to clipboard"}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-3 text-xs"
                                            onClick={handleHandoffPlan}
                                            disabled={
                                                isHandingOff || !latestPlan
                                            }
                                            type="button"
                                        >
                                            <Handshake className="size-3 mr-1" />
                                            Hand off
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>
                                            Send plan to a new chat for
                                            implementation
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="h-6 px-3 text-xs bg-foreground text-background border-foreground hover:bg-foreground/90"
                                            onClick={handleApprovePlan}
                                            type="button"
                                        >
                                            Approve{" "}
                                            <KeybindingLabel commandId="chat.approvePlan" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Execute plan in current chat</p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </>
                    )}

                    {/* Terminal command controls */}
                    {terminalCommandState && !showSessionPicker && (
                        <>
                            <span className="text-xs text-muted-foreground">
                                {terminalCommandState.stage === "pending"
                                    ? `Continue in terminal to run /${terminalCommandState.command.name}`
                                    : "Terminal opened. Once changes are complete, refresh to use them here"}
                            </span>
                            <div className="flex items-center gap-2 ml-auto">
                                {terminalCommandState.stage === "pending" ? (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-6 px-3 text-xs"
                                        onClick={handleOpenTerminal}
                                        type="button"
                                    >
                                        <Terminal className="size-3 mr-1" />
                                        Open terminal
                                    </Button>
                                ) : (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-6 px-3 text-xs"
                                        onClick={handleRefreshConfig}
                                        type="button"
                                    >
                                        <RefreshCw className="size-3 mr-1" />
                                        Refresh
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="iconXs"
                                    onClick={() =>
                                        setTerminalCommandState(null)
                                    }
                                    type="button"
                                >
                                    <X className="size-3" />
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}
            <div
                className={`relative px-4 py-3 shadow-sm min-h-36 bg-composer-background focus-within:ring-0 focus-within:outline-none cursor-text rounded-lg
                    ${
                        isViewingDiffOrFile && workspaceSessions.length > 1
                            ? "rounded-t-none"
                            : ""
                    }
                    ${
                        isPlanMode
                            ? "!border-background border"
                            : "!border-border border"
                    }
                    ${showEyebrow ? "rounded-t-none !border-t-0" : ""}`}
                onClick={() => inputRef.current?.focus()}
            >
                <AnimatedPlanBorder
                    isActive={isPlanMode}
                    className="rounded-b-lg"
                />

                {/* Linked directories display */}
                {selectedAgentType === "claude" &&
                    linkedWorkspaces.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {linkedWorkspaces.map((ws) => (
                                <LinkedWorkspaceBadge
                                    key={ws.id}
                                    linkedWorkspace={ws}
                                    onRemove={() =>
                                        removeWorkspaceLink.mutate({
                                            sourceWorkspaceId: workspaceId,
                                            targetWorkspaceId: ws.id,
                                        })
                                    }
                                />
                            ))}
                        </div>
                    )}

                <AttachmentDropArea
                    attachments={[...attachments, ...commentAttachments]}
                    onFileDrop={handleFileDrop}
                    onRemove={handleRemoveAttachment}
                    workspaceId={workspaceId}
                />

                <form
                    onSubmit={handleSubmit}
                    onPasteCapture={handlePaste}
                    className="mb-10"
                >
                    <div className="min-h-[80px] max-h-[200px] overflow-y-auto">
                        <MentionsInput
                            id="composer-input"
                            className="composer-mentions-input"
                            spellCheck={false}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            autoFocus
                            value={inputValue}
                            onChange={(_e, newValue) => setInputValue(newValue)}
                            onKeyDown={handleKeyDown}
                            onFocus={() =>
                                inputActions.setFocusedInputId(
                                    COMPOSER_INPUT_ID,
                                )
                            }
                            onBlur={() => inputActions.setFocusedInputId(null)}
                            placeholder={getPlaceholder()}
                            allowSuggestionsAboveCursor={true}
                            suggestionsPortalHost={
                                typeof document !== "undefined"
                                    ? document.body
                                    : undefined
                            }
                            inputRef={inputRef}
                            style={mentionStyle}
                            allowSpaceInQuery
                            disabled={disabled === "all"}
                        >
                            <Mention
                                trigger={FILE_MENTION_TRIGGER}
                                data={queryFiles}
                                renderSuggestion={renderSuggestion}
                                displayTransform={(_id, display) => {
                                    // Special case for notes file
                                    if (isCustomPath(display)) {
                                        return `@${getCustomPathDisplayName(display)}`;
                                    }
                                    // Show just the filename from the full path
                                    const fileName =
                                        display.split("/").pop() || display;
                                    return `@${fileName}`;
                                }}
                                appendSpaceOnAdd={true}
                                className="bg-link-elevated"
                                markup="@⟦__display__⟧(__id__)"
                            />
                            <Mention
                                trigger="/"
                                data={querySlashCommands}
                                renderSuggestion={renderSlashCommand}
                                displayTransform={(id) => `/${id}`}
                                appendSpaceOnAdd={true}
                                className="text-primary"
                                markup="/[__display__](__id__)"
                            />
                        </MentionsInput>
                    </div>

                    {/* Shortcut indicator - don't show if terminal has selection */}
                    {isNextFocus && (
                        <div className="absolute top-2 right-2 text-xs text-faint bg-composer-background backdrop-blur-[1px] rounded-full px-2 py-1">
                            <KeybindingLabel commandId="chat.focus" /> to focus
                        </div>
                    )}

                    <div
                        className="absolute bottom-3 right-3 flex items-center gap-2 flex-shrink-0 h-7"
                        onClick={(e) => e.stopPropagation()} // prevent focusing composer
                    >
                        {/* Context percentage - show for Claude sessions when >= 70% or when always visible setting is on */}
                        {!isCodexSession &&
                            (alwaysShowContextWheel ||
                                contextPercent >= 70) && (
                                <ContextUsageHoverCard
                                    sessionId={selectedSessionId}
                                    workspacePath={workspacePath}
                                    contextPercent={contextPercent}
                                />
                            )}

                        {/* Add menu (attachments, Linear) */}
                        <Popover>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="hover:bg-muted text-muted-foreground py-0.5"
                                            type="button"
                                            disabled={disabled === "all"}
                                        >
                                            <Plus
                                                className="size-4"
                                                strokeWidth={1.5}
                                            />
                                        </Button>
                                    </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>
                                        Add attachments, link issues, and more
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                            <PopoverContent
                                className="w-56 p-1 rounded-lg"
                                align="end"
                                side="top"
                            >
                                <PopoverClose asChild>
                                    <button
                                        onClick={() => {
                                            void handleAttachmentPicker();
                                        }}
                                        disabled={
                                            attachments.length >=
                                                MAX_ATTACHMENTS ||
                                            disabled === "all"
                                        }
                                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                                            attachments.length >=
                                                MAX_ATTACHMENTS ||
                                            disabled === "all"
                                                ? "opacity-50 cursor-not-allowed"
                                                : "hover:bg-popover-accent"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Paperclip className="size-4" />
                                            <span>Add attachment</span>
                                        </div>
                                        <KeybindingLabel commandId="chat.addAttachment" />
                                    </button>
                                </PopoverClose>
                                <button
                                    onClick={() => {
                                        dialogActions.openDialog(
                                            PICK_ISSUES_DIALOG_ID,
                                        );
                                    }}
                                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-popover-accent"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="flex -space-x-1">
                                            <Avatar className="size-4 border border-background">
                                                <AvatarImage
                                                    src="/linear.png"
                                                    alt="Linear"
                                                />
                                            </Avatar>
                                            <Avatar className="size-3.5 border border-background bg-background">
                                                <AvatarImage
                                                    src="/app-icons/github.svg"
                                                    alt="GitHub"
                                                    className="dark:invert p-0.5"
                                                />
                                            </Avatar>
                                        </div>
                                        <span>Link issue</span>
                                    </div>
                                    <KeybindingLabel commandId="chat.linkLinear" />
                                </button>
                                <button
                                    onClick={() => {
                                        dialogActions.openDialog(
                                            PICK_LINKED_DIRECTORIES_DIALOG_ID,
                                        );
                                    }}
                                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-popover-accent"
                                >
                                    <div className="flex items-center gap-2">
                                        <FolderSymlink className="size-4" />
                                        <span>Link workspaces</span>
                                    </div>
                                </button>
                            </PopoverContent>
                        </Popover>

                        {/* Send/Stop button - transforms based on working state */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="iconXs"
                                    className={`${getSendButtonClassName()}`}
                                    onClick={async (e) => {
                                        if (isWorking) {
                                            e.preventDefault();
                                            await messageProcessingService.cancelSession(
                                                selectedSessionId,
                                            );
                                            posthog?.capture("cancel_attempt", {
                                                session_id: selectedSessionId,
                                                method: "button",
                                            });
                                        } else {
                                            await handleSubmit(e);
                                        }
                                    }}
                                    disabled={!isWorking && !canSendMessage}
                                >
                                    <div className="flex items-center justify-center size-4">
                                        {isWorking ? (
                                            <IoStopCircleOutline className="size-4 text-foreground" />
                                        ) : (
                                            <ArrowUp
                                                className="size-4 text-background"
                                                style={{ strokeWidth: 1.5 }}
                                            />
                                        )}
                                    </div>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {getTooltipContent()}
                            </TooltipContent>
                        </Tooltip>
                    </div>

                    {/* Toggle buttons and think level indicator fixed at bottom */}
                    <div
                        className="absolute bottom-3 left-[7px] flex items-center gap-3"
                        onClick={(e) => e.stopPropagation()} // prevent focusing composer
                    >
                        {/* Model picker - always visible */}
                        <Popover
                            open={isModelPickerOpen}
                            onOpenChange={setIsModelPickerOpen}
                        >
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={isModelMenuBusy}
                                        >
                                            {selectedAgentType === "codex" && (
                                                <SiOpenai className="size-3" />
                                            )}
                                            {selectedAgentType === "claude" && (
                                                <SiClaude className="size-3" />
                                            )}
                                            <span>
                                                {MODEL_LABELS[selectedModel]}
                                            </span>
                                        </Button>
                                    </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>
                                        Change model{" "}
                                        <KeybindingLabel commandId="chat.cycleModel" />
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                            <PopoverContent
                                className="w-60 p-1 rounded-lg"
                                align="start"
                                side="top"
                            >
                                <div className="space-y-1">
                                    <div className="px-2 pt-1 pb-1 text-xs text-muted-foreground">
                                        Claude Code
                                    </div>
                                    {CLAUDE_MODELS.map((model) => (
                                        <ClaudeModelButton
                                            key={model}
                                            displayName={MODEL_LABELS[model]}
                                            icon={SiClaude}
                                            isSelected={
                                                !isCodexSession &&
                                                selectedModel === model
                                            }
                                            isNewModel={model === "opus"}
                                            isDisabled={isModelMenuBusy}
                                            tooltip={
                                                isCodexSession &&
                                                isSessionLocked
                                                    ? "Opens in new tab with summary"
                                                    : undefined
                                            }
                                            showNewTabIcon={
                                                isCodexSession &&
                                                isSessionLocked
                                            }
                                            onSelect={() =>
                                                handleSelectModel(model)
                                            }
                                        />
                                    ))}

                                    <div className="mt-2 border-t border-border/70" />

                                    <div className="px-2 pt-2 pb-1 text-xs text-muted-foreground">
                                        Codex
                                    </div>
                                    {CODEX_MODELS.map((model) => (
                                        <CodexModelButton
                                            key={model}
                                            displayName={MODEL_LABELS[model]}
                                            isSelected={selectedModel === model}
                                            isNewModel={
                                                model === "gpt-5.3-codex"
                                            }
                                            isCodexSession={isCodexSession}
                                            isCodexAuthenticated={
                                                isCodexAuthenticated
                                            }
                                            isModelMenuBusy={isModelMenuBusy}
                                            codexProvider={codexProvider}
                                            codexAuthMethod={
                                                codexAuth?.authMethod
                                            }
                                            isLoadingCodexAuth={
                                                isLoadingCodexAuth
                                            }
                                            tooltip={
                                                !isCodexSession &&
                                                isSessionLocked
                                                    ? "Opens in new tab with summary"
                                                    : undefined
                                            }
                                            showNewTabIcon={
                                                !isCodexSession &&
                                                isSessionLocked
                                            }
                                            onRefetchAuth={refetchCodexAuth}
                                            onSelect={() =>
                                                handleSelectModel(model)
                                            }
                                        />
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        {selectedSession && (
                            <ThinkingToggle
                                thinkingEnabled={
                                    selectedSession.thinkingEnabled
                                }
                                sessionId={selectedSessionId}
                                agentType={selectedAgentType}
                                codexThinkingLevel={
                                    selectedSession.codexThinkingLevel
                                }
                            />
                        )}

                        {/* Plan mode toggle button */}
                        {canTogglePlanMode && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={handleTogglePlanMode}
                                        type="button"
                                        className={`
                                            h-6 flex items-center justify-center gap-1.5 rounded-md px-2 py-0.5 transition-all duration-200 overflow-hidden
                                            ${
                                                isPlanMode
                                                    ? "bg-link hover:bg-link/80 text-link-foreground"
                                                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                                            }
                                        `}
                                    >
                                        <Map
                                            className="size-4"
                                            strokeWidth={1.5}
                                        />
                                        <AnimatePresence
                                            initial={false}
                                            mode="popLayout"
                                        >
                                            {isPlanMode && (
                                                <motion.span
                                                    key="plan"
                                                    initial={{
                                                        y: -12,
                                                        opacity: 0,
                                                    }}
                                                    animate={{
                                                        y: 0,
                                                        opacity: 1,
                                                    }}
                                                    exit={{ y: 12, opacity: 0 }}
                                                    transition={{
                                                        duration: 0.2,
                                                        ease: "easeOut",
                                                    }}
                                                    className="text-xs font-medium whitespace-nowrap"
                                                >
                                                    Plan
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>
                                        {isPlanMode ? "Disable" : "Enable"} plan
                                        mode
                                    </p>
                                    <span className="text-xs text-muted-foreground ml-1">
                                        ⇧Tab
                                    </span>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
});