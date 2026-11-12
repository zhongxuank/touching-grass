import streamlit as st

from chat.backend import agent_reply, stream_reply
from chat.errors import describe_error
from chat.history import add_message
from chat.settings import available_providers, conversation_stats, model_for


def show_calls(calls: list[dict]) -> None:
    for call in calls:
        st.markdown(f"**{call['name']}** `{call['args']}`")
        st.code(call["result"], language=None)


def show_sources(sources: list[str]) -> None:
    if sources:
        st.caption("Sources: " + ", ".join(sources))


st.title("Notes chatbot")

if "history" not in st.session_state:
    st.session_state.history = []

with st.sidebar:
    st.header("Settings")
    provider = st.selectbox("Provider", available_providers())
    if provider:
        st.caption(f"Model: {model_for(provider)}")
    else:
        st.warning("No API key found. Fill in one key in .env.")
    use_tools = st.toggle("Use my notes and tools", value=True)
    if st.button("Clear chat"):
        st.session_state.history = []
    stats_box = st.empty()

history = st.session_state.history

for message in history:
    with st.chat_message(message["role"]):
        if message.get("error"):
            st.error(message["content"])
            continue
        if message.get("calls"):
            with st.expander(f"Tool calls ({len(message['calls'])})"):
                show_calls(message["calls"])
        st.markdown(message["content"])
        show_sources(message.get("sources", []))

question = st.chat_input("Ask about your notes")
if question:
    with st.chat_message("user"):
        st.markdown(question)
    extra = {}
    with st.chat_message("assistant"):
        try:
            if use_tools:
                with st.status("Thinking...") as status:
                    result = agent_reply(history, question, provider=provider)
                    show_calls(result.calls)
                    status.update(label=f"Used {len(result.calls)} tool call(s)", state="complete", expanded=False)
                st.markdown(result.text)
                show_sources(result.sources)
                answer = result.text
                extra = {"calls": result.calls, "sources": result.sources}
            else:
                answer = st.write_stream(stream_reply(history, question, provider=provider))
        except Exception as exc:
            answer = describe_error(exc)
            st.error(answer)
            extra = {"error": True}
    add_message(history, "user", question)
    add_message(history, "assistant", answer, **extra)

stats = conversation_stats(history)
stats_box.caption(f"{stats['messages']} messages, about {stats['tokens']} tokens")
