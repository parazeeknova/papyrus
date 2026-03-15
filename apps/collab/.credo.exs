%{
  configs: [
    %{
      name: "default",
      files: %{
        included: ["config/", "lib/", "test/", "mix.exs"],
        excluded: [~r"/_build/", ~r"/deps/"]
      },
      checks: [
        {Credo.Check.Design.TagTODO, false},
        {Credo.Check.Design.TagFIXME, false}
      ]
    }
  ]
}
